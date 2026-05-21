import { buildFileContext } from "../utils.js";
/**
 * Assemble the full prompt for a role dispatch.
 * Includes the role's system prompt, task description, and file contents.
 */
export function buildContext(role, task, files) {
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
//# sourceMappingURL=context.js.map