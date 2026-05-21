/**
 * Core types for pi-agent-roles.
 */
export interface AgentRole {
    id: string;
    name: string;
    systemPrompt: string;
    model?: string;
    skills?: string[];
    maxTokens?: number;
    tools?: string[];
    timeoutSeconds?: number;
    outputDir?: string;
    context?: "fresh" | "fork";
}
export interface RoleDispatch {
    roleId: string;
    task: string;
    files?: string[];
    mode: "blocking" | "async";
    meshTarget?: string;
    outputTo?: string;
    chainAfter?: string;
}
export interface DispatchResult {
    handle: string;
    status: "running" | "complete" | "failed" | "timeout" | "cancelled";
    output?: string;
    exitCode?: number;
    durationMs?: number;
    artifacts?: string[];
    startedAt: string;
    finishedAt?: string;
    roleId: string;
    task: string;
}
export type RoleAction = "list" | "show" | "create" | "update" | "delete" | "dispatch" | "status" | "cancel" | "result";
export interface PiRolesParams {
    action: RoleAction;
    roleId?: string;
    name?: string;
    systemPrompt?: string;
    model?: string;
    skills?: string[];
    maxTokens?: number;
    tools?: string[];
    timeoutSeconds?: number;
    outputDir?: string;
    context?: "fresh" | "fork";
    task?: string;
    files?: string[];
    mode?: "blocking" | "async";
    outputTo?: string;
    handle?: string;
}
export interface PiRolesResult {
    status: "ok" | "error";
    message?: string;
    data?: unknown;
}
//# sourceMappingURL=types.d.ts.map