import { AgentRole } from "../types.js";
import { buildFileContext } from "../utils.js";

export interface BuiltContext {
  systemPrompt: string;
  userPrompt: string;
  resolvedFiles: string[];
}

/**
 * Assemble the full prompt for a role dispatch.
 * Includes the role's system prompt, task description, and file contents.
 */
export function buildContext(
  role: AgentRole,
  task: string,
  files?: string[]
): BuiltContext {
  const resolvedFiles = files ?? [];
  const fileCtx = resolvedFiles.length > 0 ? buildFileContext(resolvedFiles) : "";

  const userPrompt = `
## Task
${task}

${fileCtx}
`.trim();

  return {
    systemPrompt: role.systemPrompt,
    userPrompt,
    resolvedFiles,
  };
}
