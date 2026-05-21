/**
 * Pi Agent Roles Extension
 *
 * Lightweight role-based delegation. Define roles, dispatch tasks,
 * get results — blocking or async.
 */
import * as path from "node:path";
import * as os from "node:os";
import { Type } from "typebox";
import { RoleStore } from "../roles/store.js";
import { Dispatcher } from "../roles/dispatch.js";
const ROLES_FILE = path.join(os.homedir(), ".pi", "agent", "roles.json");
const DISPATCHES_DIR = path.join(os.homedir(), ".pi", "agent", "dispatches");
const RoleActionEnum = Type.String({
    description: "Action: list, show, create, update, delete, dispatch, status, cancel, result",
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
    context: Type.Optional(Type.StringEnum(["fresh", "fork"])),
    task: Type.Optional(Type.String()),
    files: Type.Optional(Type.Array(Type.String())),
    mode: Type.Optional(Type.StringEnum(["blocking", "async"])),
    meshTarget: Type.Optional(Type.String()),
    handle: Type.Optional(Type.String()),
});
function makeBackend(pi) {
    // If Pi exposes a subagent method, use it.
    // Otherwise, fallback to returning a steer indicating
    // the user should invoke the role manually.
    const subagentFn = typeof pi.subagent === "function"
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
                        model: params.model,
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
    // Fallback: "execute" by returning the assembled prompt as
    // the output, signalling the caller to run it manually.
    return {
        async run(params) {
            return {
                output: `\n--- ROLE SYSTEM PROMPT ---\n${params.systemPrompt}\n\n--- TASK ---\n${params.task}\n\n[Subagent API unavailable. Run the above prompt manually.]`,
                exitCode: 0,
                durationMs: 0,
            };
        },
    };
}
export default function piAgentRolesExtension(pi) {
    const backend = makeBackend(pi);
    const store = new RoleStore({ rolesFile: ROLES_FILE });
    const dispatcher = new Dispatcher({
        store,
        dispatchesDir: DISPATCHES_DIR,
        defaultTimeoutSeconds: 300,
    });
    // ── Bridge: respond to inter-extension dispatch requests via EventBus ──
    pi.events.on("roles:dispatch:request", async (data) => {
        const { requestId, params, responseChannel } = data;
        try {
            const { roleId, task, mode, files } = params;
            if (mode === "blocking") {
                const result = await dispatcher.dispatchBlocking(roleId, task, files, backend, params.outputTo, params.meshTarget);
                pi.events.emit(responseChannel, { success: true, result });
            }
            else {
                const { handle } = await dispatcher.dispatchAsync(roleId, task, files, backend, params.outputTo, params.meshTarget);
                pi.events.emit(responseChannel, { success: true, result: { handle } });
            }
        }
        catch (err) {
            pi.events.emit(responseChannel, { success: false, error: String(err) });
        }
    });
    pi.events.on("roles:status:request", async (data) => {
        const { params, responseChannel } = data;
        try {
            const rec = dispatcher.getStatus(params.handle);
            if (!rec)
                throw new Error(`Dispatch not found: ${params.handle}`);
            pi.events.emit(responseChannel, { success: true, result: rec });
        }
        catch (err) {
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
            const params = rawParams;
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
        renderCall(args, theme) {
            return `${theme.fg("toolTitle", "pi_roles")} ${theme.fg("accent", args.action)}`;
        },
        renderResult(result, _opts, theme) {
            const status = result.isError ? theme.fg("error", "error") : theme.fg("success", "ok");
            return `${theme.fg("toolTitle", "pi_roles")} ${status}`;
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
async function handleRoleAction(params, deps) {
    const { store, dispatcher, backend } = deps;
    switch (params.action) {
        case "list": {
            const roles = store.list();
            const out = roles.map((r) => `${r.id.padEnd(24)} ${r.name} ${r.model ?? "default"}`);
            return { status: "ok", data: roles, message: out.join("\n") };
        }
        case "show": {
            if (!params.roleId)
                return { status: "error", message: "roleId required" };
            const role = store.get(params.roleId);
            if (!role)
                return { status: "error", message: `Unknown role: ${params.roleId}` };
            return { status: "ok", data: role };
        }
        case "create": {
            if (!params.roleId || !params.name || !params.systemPrompt) {
                return { status: "error", message: "roleId, name, and systemPrompt required" };
            }
            const role = {
                id: params.roleId,
                name: params.name,
                systemPrompt: params.systemPrompt,
                model: params.model,
                skills: params.skills,
                maxTokens: params.maxTokens,
                tools: params.tools,
                timeoutSeconds: params.timeoutSeconds,
                outputDir: params.outputDir,
                context: params.context,
            };
            if (!store.create(role))
                return { status: "error", message: `Role ${params.roleId} already exists` };
            return { status: "ok", message: `Created role "${params.roleId}"` };
        }
        case "update": {
            if (!params.roleId)
                return { status: "error", message: "roleId required" };
            const ok = store.update(params.roleId, {
                name: params.name,
                systemPrompt: params.systemPrompt,
                model: params.model,
                skills: params.skills,
                maxTokens: params.maxTokens,
                tools: params.tools,
                timeoutSeconds: params.timeoutSeconds,
                outputDir: params.outputDir,
                context: params.context,
            });
            if (!ok)
                return { status: "error", message: `Unknown role: ${params.roleId}` };
            return { status: "ok", message: `Updated role "${params.roleId}"` };
        }
        case "delete": {
            if (!params.roleId)
                return { status: "error", message: "roleId required" };
            if (!store.delete(params.roleId))
                return { status: "error", message: `Unknown role: ${params.roleId}` };
            return { status: "ok", message: `Deleted role "${params.roleId}"` };
        }
        case "dispatch": {
            if (!params.roleId || !params.task) {
                return { status: "error", message: "roleId and task required" };
            }
            const mode = params.mode ?? "blocking";
            try {
                if (mode === "blocking") {
                    const result = await dispatcher.dispatchBlocking(params.roleId, params.task, params.files, backend, params.outputTo, params.meshTarget);
                    const meta = result.exitCode !== undefined ? ` [exit: ${result.exitCode}]` : "";
                    const dur = result.durationMs ? ` (${Math.round(result.durationMs / 1000)}s)` : "";
                    return {
                        status: "ok",
                        data: result,
                        message: `[${result.status}]${meta}${dur}\n\n${result.output ?? "No output"}`,
                    };
                }
                else {
                    const { handle } = await dispatcher.dispatchAsync(params.roleId, params.task, params.files, backend, params.outputTo, params.meshTarget);
                    return {
                        status: "ok",
                        data: { handle },
                        message: `Async dispatch started. Handle: ${handle}\nCheck status with pi_roles({ action: "status", handle: "${handle}" })`,
                    };
                }
            }
            catch (err) {
                return { status: "error", message: String(err) };
            }
        }
        case "status": {
            if (!params.handle)
                return { status: "error", message: "handle required" };
            const rec = dispatcher.getStatus(params.handle);
            if (!rec)
                return { status: "error", message: `Dispatch not found: ${params.handle}` };
            const dur = rec.durationMs ? ` (${Math.round(rec.durationMs / 1000)}s)` : "";
            return {
                status: "ok",
                data: rec,
                message: `Status: ${rec.status}${dur}\nRole: ${rec.roleId}\nTask: ${rec.task}`,
            };
        }
        case "cancel": {
            if (!params.handle)
                return { status: "error", message: "handle required" };
            const ok = dispatcher.cancel(params.handle);
            if (!ok)
                return { status: "error", message: `Dispatch not found or already finished: ${params.handle}` };
            return { status: "ok", message: `Cancelled ${params.handle}` };
        }
        case "result": {
            if (!params.handle)
                return { status: "error", message: "handle required" };
            const rec = dispatcher.getStatus(params.handle);
            if (!rec)
                return { status: "error", message: `Dispatch not found: ${params.handle}` };
            if (rec.status !== "complete")
                return { status: "error", message: `Dispatch status: ${rec.status}` };
            return { status: "ok", data: rec, message: rec.output ?? "No output" };
        }
        default:
            return { status: "error", message: `Unknown action: ${params.action}` };
    }
}
//# sourceMappingURL=index.js.map