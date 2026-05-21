import { DispatchResult } from "../types.js";
import { RoleStore } from "./store.js";
export interface ExecuteBackend {
    run(params: {
        systemPrompt: string;
        task: string;
        context?: "fresh" | "fork";
        model?: string;
        skills?: string[];
        timeoutSeconds?: number;
    }): Promise<{
        output: string;
        exitCode: number;
        durationMs: number;
    }>;
}
export interface DispatchOpts {
    store: RoleStore;
    dispatchesDir: string;
    defaultTimeoutSeconds: number;
}
export declare class Dispatcher {
    private store;
    private dir;
    private defaultTimeout;
    private meshInbox;
    constructor(opts: DispatchOpts);
    private recordPath;
    private writeRecord;
    private readRecord;
    private buildInitialRecord;
    private runWithTimeout;
    private completeRecord;
    private sendMeshMessage;
    /** Poll mesh inbox for a reply to our message. Returns matching msg or null. */
    private pollMeshReply;
    dispatchBlocking(roleId: string, task: string, files: string[] | undefined, backend: ExecuteBackend, outputTo?: string, meshTarget?: string): Promise<DispatchResult>;
    dispatchAsync(roleId: string, task: string, files: string[] | undefined, backend: ExecuteBackend, outputTo?: string, meshTarget?: string): Promise<{
        handle: string;
    }>;
    getStatus(handle: string): DispatchResult | null;
    cancel(handle: string): boolean;
    listDispatches(): DispatchResult[];
}
//# sourceMappingURL=dispatch.d.ts.map