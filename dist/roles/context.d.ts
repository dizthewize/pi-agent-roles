import { AgentRole } from "../types.js";
export interface BuiltContext {
    systemPrompt: string;
    userPrompt: string;
    resolvedFiles: string[];
}
/**
 * Assemble the full prompt for a role dispatch.
 * Includes the role's system prompt, task description, and file contents.
 */
export declare function buildContext(role: AgentRole, task: string, files?: string[]): BuiltContext;
//# sourceMappingURL=context.d.ts.map