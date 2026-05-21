import * as fs from "node:fs";
import * as path from "node:path";
import { buildContext } from "./context.js";
import { generateHandle, nowISO, readJSON, writeJSON, mkdirpSync, } from "../utils.js";
export class Dispatcher {
    store;
    dir;
    defaultTimeout;
    meshInbox;
    constructor(opts) {
        this.store = opts.store;
        this.dir = opts.dispatchesDir;
        this.defaultTimeout = opts.defaultTimeoutSeconds;
        this.meshInbox = path.join(path.dirname(this.dir), "mesh", "inbox");
        mkdirpSync(this.dir);
    }
    recordPath(handle) {
        return path.join(this.dir, `${handle}.json`);
    }
    writeRecord(rec) {
        writeJSON(this.recordPath(rec.handle), rec);
    }
    readRecord(handle) {
        return readJSON(this.recordPath(handle));
    }
    buildInitialRecord(handle, role, task) {
        return {
            handle,
            status: "running",
            roleId: role.id,
            task,
            startedAt: nowISO(),
        };
    }
    async runWithTimeout(promise, timeoutMs) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
        });
        try {
            const result = await Promise.race([
                promise.then((r) => ({ result: r, timedOut: false })),
                timeout,
            ]);
            clearTimeout(timer);
            return result;
        }
        catch {
            return { timedOut: true };
        }
    }
    completeRecord(handle, status, data) {
        const rec = this.readRecord(handle);
        if (!rec)
            return null;
        rec.status = status;
        rec.finishedAt = nowISO();
        if (data?.output !== undefined)
            rec.output = data.output;
        if (data?.exitCode !== undefined)
            rec.exitCode = data.exitCode;
        if (data?.durationMs !== undefined)
            rec.durationMs = data.durationMs;
        if (data?.artifacts !== undefined)
            rec.artifacts = data.artifacts;
        this.writeRecord(rec);
        return rec;
    }
    sendMeshMessage(params) {
        const msg = {
            id: crypto.randomUUID(),
            from: "pi-agent-roles",
            fromName: params.fromName,
            to: params.to,
            type: "dm",
            body: params.body,
            taskId: params.taskId,
            priority: "normal",
            timestamp: nowISO(),
            read: {},
        };
        fs.mkdirSync(this.meshInbox, { recursive: true });
        writeJSON(path.join(this.meshInbox, `${Date.now()}-${msg.id}.json`), msg);
    }
    /** Poll mesh inbox for a reply to our message. Returns matching msg or null. */
    pollMeshReply(toAgent, afterMs, timeoutMs) {
        const cutoff = Date.now() + timeoutMs;
        while (Date.now() < cutoff) {
            const files = [];
            try {
                files.push(...fs.readdirSync(this.meshInbox).filter((f) => f.endsWith(".json")));
            }
            catch { /* ignore */ }
            for (const f of files) {
                const msg = readJSON(path.join(this.meshInbox, f));
                if (!msg)
                    continue;
                if (msg.to === "pi-agent-roles" && msg.from === toAgent && new Date(msg.timestamp).getTime() > afterMs) {
                    return this.completeRecord("", "complete", {
                        output: String(msg.body ?? ""),
                    });
                }
            }
            // sleep 500ms
            const start = Date.now();
            while (Date.now() - start < 500) { }
        }
        return null;
    }
    async dispatchBlocking(roleId, task, files, backend, outputTo, meshTarget) {
        const role = this.store.get(roleId);
        if (!role)
            throw new Error(`Role not found: ${roleId}`);
        // Point B: delegate to mesh agent
        if (meshTarget) {
            const { systemPrompt, userPrompt } = buildContext(role, task, files);
            const handle = generateHandle();
            const rec = this.buildInitialRecord(handle, role, task);
            this.writeRecord(rec);
            this.sendMeshMessage({
                fromName: role.name,
                to: meshTarget,
                body: `**Role task dispatched by pi-agent-roles**

System: ${systemPrompt}

Task: ${userPrompt}`,
                taskId: handle,
            });
            const afterMs = Date.now();
            const timeoutMs = (role.timeoutSeconds ?? this.defaultTimeout) * 1000;
            const output = this.pollMeshReply(meshTarget, afterMs, timeoutMs);
            if (!output) {
                this.completeRecord(handle, "timeout");
                rec.status = "timeout";
                rec.finishedAt = nowISO();
                return rec;
            }
            if (outputTo) {
                try {
                    fs.mkdirSync(path.dirname(outputTo), { recursive: true });
                    fs.writeFileSync(outputTo, output.output ?? "", "utf-8");
                }
                catch { /* ignore */ }
            }
            return this.completeRecord(handle, "complete", {
                output: output.output ?? "",
            });
        }
        const { systemPrompt, userPrompt } = buildContext(role, task, files);
        const handle = generateHandle();
        const rec = this.buildInitialRecord(handle, role, task);
        this.writeRecord(rec);
        const timeoutMs = (role.timeoutSeconds ?? this.defaultTimeout) * 1000;
        try {
            const { result, timedOut } = await this.runWithTimeout(backend.run({
                systemPrompt,
                task: userPrompt,
                context: role.context ?? "fork",
                model: role.model,
                skills: role.skills,
                timeoutSeconds: role.timeoutSeconds ?? this.defaultTimeout,
            }), timeoutMs);
            if (timedOut || !result) {
                this.completeRecord(handle, "timeout");
                rec.status = "timeout";
                rec.finishedAt = nowISO();
                return rec;
            }
            // Write outputTo if requested
            if (outputTo) {
                fs.mkdirSync(path.dirname(outputTo), { recursive: true });
                fs.writeFileSync(outputTo, result.output, "utf-8");
            }
            return this.completeRecord(handle, "complete", {
                output: result.output,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
            });
        }
        catch {
            return this.completeRecord(handle, "failed", {
                output: "Execution error",
                exitCode: 1,
            });
        }
    }
    async dispatchAsync(roleId, task, files, backend, outputTo, meshTarget) {
        const role = this.store.get(roleId);
        if (!role)
            throw new Error(`Role not found: ${roleId}`);
        // Point B: delegate to mesh agent
        if (meshTarget) {
            const { systemPrompt, userPrompt } = buildContext(role, task, files);
            const handle = generateHandle();
            const rec = this.buildInitialRecord(handle, role, task);
            this.writeRecord(rec);
            this.sendMeshMessage({
                fromName: role.name,
                to: meshTarget,
                body: `**Role task dispatched by pi-agent-roles**

System: ${systemPrompt}

Task: ${userPrompt}`,
                taskId: handle,
            });
            // Background: poll for reply and update record
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            (async () => {
                const afterMs = Date.now();
                const timeoutMs = (role.timeoutSeconds ?? this.defaultTimeout) * 1000;
                const output = this.pollMeshReply(meshTarget, afterMs, timeoutMs);
                if (!output) {
                    this.completeRecord(handle, "timeout");
                    return;
                }
                if (outputTo) {
                    try {
                        fs.mkdirSync(path.dirname(outputTo), { recursive: true });
                        fs.writeFileSync(outputTo, output.output ?? "", "utf-8");
                    }
                    catch { /* ignore */ }
                }
                this.completeRecord(handle, "complete", {
                    output: output.output ?? "",
                });
            })();
            return { handle };
        }
        const { systemPrompt, userPrompt } = buildContext(role, task, files);
        const handle = generateHandle();
        const rec = this.buildInitialRecord(handle, role, task);
        this.writeRecord(rec);
        // Fire-and-forget: run in background without awaiting
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        (async () => {
            const timeoutMs = (role.timeoutSeconds ?? this.defaultTimeout) * 1000;
            const { result, timedOut } = await this.runWithTimeout(backend.run({
                systemPrompt,
                task: userPrompt,
                context: role.context ?? "fork",
                model: role.model,
                skills: role.skills,
                timeoutSeconds: role.timeoutSeconds ?? this.defaultTimeout,
            }), timeoutMs);
            if (timedOut || !result) {
                this.completeRecord(handle, "timeout");
                return;
            }
            if (outputTo) {
                try {
                    fs.mkdirSync(path.dirname(outputTo), { recursive: true });
                    fs.writeFileSync(outputTo, result.output, "utf-8");
                }
                catch { /* ignore */ }
            }
            this.completeRecord(handle, "complete", {
                output: result.output,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
            });
        })();
        return { handle };
    }
    getStatus(handle) {
        return this.readRecord(handle);
    }
    cancel(handle) {
        const rec = this.readRecord(handle);
        if (!rec)
            return false;
        if (rec.status === "complete" || rec.status === "failed" || rec.status === "timeout" || rec.status === "cancelled") {
            return false;
        }
        rec.status = "cancelled";
        rec.finishedAt = nowISO();
        this.writeRecord(rec);
        return true;
    }
    listDispatches() {
        const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
        return files
            .map((f) => readJSON(path.join(this.dir, f)))
            .filter(Boolean);
    }
}
//# sourceMappingURL=dispatch.js.map