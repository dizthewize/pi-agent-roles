/**
 * Pi Agent Roles Extension
 *
 * Lightweight role-based delegation. Define roles, dispatch tasks,
 * get results — blocking or async.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Read environment variables from the user's login shell.
 * Pi may have been started before env vars were set; this ensures
 * subprocesses get the same environment as a fresh terminal.
 */
function getShellEnv(): Record<string, string> {
  try {
    const shell = process.env.SHELL || "/bin/sh";
    const output = execSync(`${shell} -lc 'env'`, { encoding: "utf-8", timeout: 5000 });
    const env: Record<string, string> = {};
    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        env[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    return env;
  } catch {
    return {};
  }
}

/** API key env vars that should be forwarded to subprocesses. */
const API_KEY_VARS = [
  "OPENCODE_API_KEY",
  "OLLAMA_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "MOONSHOT_API_KEY",
  "FIREWORKS_API_KEY",
  "TOGETHER_API_KEY",
  "XAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "HF_TOKEN",
  "CLOUDFLARE_API_KEY",
];

function buildSubprocessEnv(): NodeJS.ProcessEnv {
  const shellEnv = getShellEnv();
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const key of API_KEY_VARS) {
    const shellVal = shellEnv[key];
    if (shellVal && shellVal.trim()) {
      merged[key] = shellVal;
    }
  }
  return merged;
}
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { AgentRole, RoleAction, PiRolesParams, PiRolesResult, DispatchResult } from "../types.js";
import { RoleStore } from "../roles/store.js";
import { Dispatcher, ExecuteBackend } from "../roles/dispatch.js";
import { buildFileContext, nowISO } from "../utils.js";

function resolveSubagentModel(currentModel?: { id: string; provider?: string } | string): string | undefined {
  const modelId = typeof currentModel === "string" ? currentModel : currentModel?.id;
  if (!modelId || modelId === "default") return undefined;

  // Already fully qualified (provider/model) — use as-is
  if (modelId.includes("/")) return modelId;

  // ollama-cloud is an extension provider; subprocesses won't load it.
  // Map to the equivalent opencode-go proxy which uses the same backend.
  if (modelId.startsWith("ollama-cloud/")) {
    const name = modelId.replace("ollama-cloud/", "");
    return `opencode-go/${name}`;
  }

  // Model ID is bare (e.g. "kimi-k2.6"). Pi stores provider separately.
  // Prepend provider so subprocesses resolve unambiguously.
  const provider = typeof currentModel === "string" ? undefined : currentModel?.provider;
  if (provider) {
    return `${provider}/${modelId}`;
  }

  return modelId;
}

const ROLES_FILE = path.join(os.homedir(), ".pi", "agent", "roles.json");
const DISPATCHES_DIR = path.join(os.homedir(), ".pi", "agent", "dispatches");

const RoleActionEnum = Type.String({
  description:
    "Action: list, show, create, update, delete, dispatch, status, cancel, result",
});

const PiRolesSchema = Type.Object({
  action: RoleActionEnum,
  roleId: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  skills: Type.Optional(Type.Array(Type.String())),
  maxTokens: Type.Optional(Type.Number()),
  tools: Type.Optional(Type.Array(Type.String())),
  timeoutSeconds: Type.Optional(Type.Number()),
  outputDir: Type.Optional(Type.String()),
  context: Type.Optional(Type.String({ enum: ["fresh", "fork"] })),
  task: Type.Optional(Type.String()),
  files: Type.Optional(Type.Array(Type.String())),
  mode: Type.Optional(Type.String({ enum: ["blocking", "async"] })),
  meshTarget: Type.Optional(Type.String()),
  outputTo: Type.Optional(Type.String()),
  handle: Type.Optional(Type.String()),
});

type PiRolesType = Static<typeof PiRolesSchema>;

function makeBackend(pi: ExtensionAPI | any): ExecuteBackend {
  // If Pi exposes a subagent method, use it.
  // Otherwise, fallback to returning a steer indicating
  // the user should invoke the role manually.
  const subagentFn =
    typeof pi.subagent === "function"
      ? pi.subagent
      : typeof pi.api?.subagent === "function"
      ? pi.api.subagent
      : null;

  if (subagentFn) {
    return {
      async run(params) {
        const start = Date.now();
        const result = await subagentFn({
          agent: "custom",
          config: {
            systemPrompt: params.systemPrompt,
            ...(params.model ? { model: params.model } : {}),
            inheritSkills: params.skills,
          },
          task: params.task,
          context: params.context ?? "fork",
          async: false,
        });
        return {
          output: result?.output ?? String(result),
          exitCode: 0,
          durationMs: Date.now() - start,
        };
      },
    };
  }

  // Fallback: spawn a subprocess via `pi` CLI so role tasks actually execute
  // instead of returning steer text. Matches the pattern in pi-workflows runner.

  return {
    async run(params) {
      const start = Date.now();
      const args: string[] = ["--mode", "json", "-p", "--no-session"];
      if (params.model) args.push("--model", params.model);
      if (params.context) args.push("--context", params.context);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-role-"));
      const tmpPromptPath = path.join(tmpDir, `prompt-${randomUUID()}.md`);

      const systemPrompt = (params.systemPrompt ?? "").trim();
      if (systemPrompt) {
        fs.writeFileSync(tmpPromptPath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
        args.push("--system-prompt", tmpPromptPath);
      }

      args.push(`Task: ${params.task}`);

      return new Promise((resolve) => {
        let rawOutput = "";
        // DEBUG: log spawn args
        const proc = spawn("pi", args, {
          cwd: process.cwd(),
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          env: buildSubprocessEnv(),
        });

        proc.stdout.on("data", (data: Buffer) => { rawOutput += data.toString(); });
        proc.stderr.on("data", (data: Buffer) => { /* ignore stderr */ });

        proc.on("close", (code) => {
          if (systemPrompt) {
            try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
            try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
          }
          resolve({
            output: rawOutput,
            exitCode: code ?? 0,
            durationMs: Date.now() - start,
          });
        });

        proc.on("error", () => {
          resolve({
            output: rawOutput,
            exitCode: 1,
            durationMs: Date.now() - start,
          });
        });
      });
    },
  };
}

export default function piAgentRolesExtension(pi: ExtensionAPI) {
  const backend = makeBackend(pi);
  const store = new RoleStore({ rolesFile: ROLES_FILE });
  const dispatcher = new Dispatcher({
    store,
    dispatchesDir: DISPATCHES_DIR,
    defaultTimeoutSeconds: 300,
  });

  // ── Bridge: respond to inter-extension dispatch requests via EventBus ──
  pi.events.on("roles:dispatch:request", async (data) => {
    const { requestId, params, responseChannel } = data as any;
    try {
      const { roleId, task, mode, files, model } = params;
      if (mode === "blocking") {
        const result = await dispatcher.dispatchBlocking(
          roleId, task, files, backend, params.outputTo, params.meshTarget, resolveSubagentModel(model)
        );
        pi.events.emit(responseChannel, { success: true, result });
      } else {
        const { handle } = await dispatcher.dispatchAsync(
          roleId, task, files, backend, params.outputTo, params.meshTarget, resolveSubagentModel(model)
        );
        pi.events.emit(responseChannel, { success: true, result: { handle } });
      }
    } catch (err) {
      pi.events.emit(responseChannel, { success: false, error: String(err) });
    }
  });

  pi.events.on("roles:status:request", async (data) => {
    const { params, responseChannel } = data as any;
    try {
      const rec = dispatcher.getStatus(params.handle);
      if (!rec) throw new Error(`Dispatch not found: ${params.handle}`);
      pi.events.emit(responseChannel, { success: true, result: rec });
    } catch (err) {
      pi.events.emit(responseChannel, { success: false, error: String(err) });
    }
  });

  pi.registerTool({
    name: "pi_roles",
    label: "Pi Agent Roles",
    description: `Role-based delegation for Pi. Define a role, dispatch a task, get a result.

CRUD actions:
  pi_roles({ action: "list" })
  pi_roles({ action: "show", roleId: "security-auditor" })
  pi_roles({ action: "create", roleId: "security-auditor", name: "Security Auditor", systemPrompt: "..." })
  pi_roles({ action: "update", roleId: "security-auditor", name: "New name" })
  pi_roles({ action: "delete", roleId: "security-auditor" })

Dispatch actions:
  pi_roles({ action: "dispatch", roleId: "security-auditor", task: "Audit auth.ts", mode: "blocking" })
  pi_roles({ action: "dispatch", roleId: "doc-writer", task: "Write README", mode: "async" })
  pi_roles({ action: "status", handle: "d-abc123" })
  pi_roles({ action: "cancel", handle: "d-abc123" })`,
    parameters: PiRolesSchema,

    async execute(_toolCallId, rawParams, _signal, _onUpdate, _ctx) {
      const params = rawParams as PiRolesType;
      // Inject resolved model from current session if role dispatch lacks one
      if (params.action === "dispatch" && !params.model && (_ctx as any).model?.id) {
        params.model = resolveSubagentModel((_ctx as any).model);
      }
      const result = await handleRoleAction(params, { store, dispatcher, backend });
      return {
        content: [
          {
            type: "text",
            text: result.message ?? JSON.stringify(result.data, null, 2),
          },
        ],
        details: result,
      };
    },
  });

  pi.registerCommand("roles", {
    description: "List roles and dispatches",
    handler: async (_args, ctx) => {
      const roles = store.list();
      ctx.ui.notify(`Roles: ${roles.length}`, "info");
    },
  });

  pi.on("session_shutdown", async () => {
    // Clean very old dispatch records
    const { pruneOldDispatches } = await import("../utils.js");
    pruneOldDispatches(DISPATCHES_DIR);
  });
}

interface RoleDeps {
  store: RoleStore;
  dispatcher: Dispatcher;
  backend: ExecuteBackend;
}

async function handleRoleAction(
  params: PiRolesType,
  deps: RoleDeps
): Promise<PiRolesResult> {
  const { store, dispatcher, backend } = deps;

  switch (params.action) {
    case "list": {
      const roles = store.list();
      const out = roles.map(
        (r) => `${r.id.padEnd(24)} ${r.name} ${r.model ?? "default"}`
      );
      return { status: "ok", data: roles, message: out.join("\n") };
    }

    case "show": {
      if (!params.roleId) return { status: "error", message: "roleId required" };
      const role = store.get(params.roleId);
      if (!role) return { status: "error", message: `Unknown role: ${params.roleId}` };
      return { status: "ok", data: role };
    }

    case "create": {
      if (!params.roleId || !params.name || !params.systemPrompt) {
        return { status: "error", message: "roleId, name, and systemPrompt required" };
      }
      const role: AgentRole = {
        id: params.roleId,
        name: params.name,
        systemPrompt: params.systemPrompt,
        model: params.model,
        skills: params.skills,
        maxTokens: params.maxTokens,
        tools: params.tools,
        timeoutSeconds: params.timeoutSeconds,
        outputDir: params.outputDir,
        context: params.context as AgentRole["context"],
      };
      if (!store.create(role)) return { status: "error", message: `Role ${params.roleId} already exists` };
      return { status: "ok", message: `Created role "${params.roleId}"` };
    }

    case "update": {
      if (!params.roleId) return { status: "error", message: "roleId required" };
      const ok = store.update(params.roleId, {
        name: params.name,
        systemPrompt: params.systemPrompt,
        model: params.model,
        skills: params.skills,
        maxTokens: params.maxTokens,
        tools: params.tools,
        timeoutSeconds: params.timeoutSeconds,
        outputDir: params.outputDir,
        context: params.context as AgentRole["context"],
      });
      if (!ok) return { status: "error", message: `Unknown role: ${params.roleId}` };
      return { status: "ok", message: `Updated role "${params.roleId}"` };
    }

    case "delete": {
      if (!params.roleId) return { status: "error", message: "roleId required" };
      if (!store.delete(params.roleId)) return { status: "error", message: `Unknown role: ${params.roleId}` };
      return { status: "ok", message: `Deleted role "${params.roleId}"` };
    }

    case "dispatch": {
      if (!params.roleId || !params.task) {
        return { status: "error", message: "roleId and task required" };
      }
      const mode = params.mode ?? "blocking";
      try {
        if (mode === "blocking") {
          const result = await dispatcher.dispatchBlocking(
            params.roleId,
            params.task,
            params.files,
            backend,
            params.outputTo,
            params.meshTarget,
            params.model
          );
          const meta = result.exitCode !== undefined ? ` [exit: ${result.exitCode}]` : "";
          const dur = result.durationMs ? ` (${Math.round(result.durationMs / 1000)}s)` : "";
          return {
            status: "ok",
            data: result,
            message: `[${result.status}]${meta}${dur}\n\n${result.output ?? "No output"}`,
          };
        } else {
          const { handle } = await dispatcher.dispatchAsync(
            params.roleId,
            params.task,
            params.files,
            backend,
            params.outputTo,
            params.meshTarget,
            params.model
          );
          return {
            status: "ok",
            data: { handle },
            message: `Async dispatch started. Handle: ${handle}\nCheck status with pi_roles({ action: "status", handle: "${handle}" })`,
          };
        }
      } catch (err) {
        return { status: "error", message: String(err) };
      }
    }

    case "status": {
      if (!params.handle) return { status: "error", message: "handle required" };
      const rec = dispatcher.getStatus(params.handle);
      if (!rec) return { status: "error", message: `Dispatch not found: ${params.handle}` };
      const dur = rec.durationMs ? ` (${Math.round(rec.durationMs / 1000)}s)` : "";
      return {
        status: "ok",
        data: rec,
        message: `Status: ${rec.status}${dur}\nRole: ${rec.roleId}\nTask: ${rec.task}`,
      };
    }

    case "cancel": {
      if (!params.handle) return { status: "error", message: "handle required" };
      const ok = dispatcher.cancel(params.handle);
      if (!ok) return { status: "error", message: `Dispatch not found or already finished: ${params.handle}` };
      return { status: "ok", message: `Cancelled ${params.handle}` };
    }

    case "result": {
      if (!params.handle) return { status: "error", message: "handle required" };
      const rec = dispatcher.getStatus(params.handle);
      if (!rec) return { status: "error", message: `Dispatch not found: ${params.handle}` };
      if (rec.status !== "complete")
        return { status: "error", message: `Dispatch status: ${rec.status}` };
      return { status: "ok", data: rec, message: rec.output ?? "No output" };
    }

    default:
      return { status: "error", message: `Unknown action: ${params.action}` };
  }
}
