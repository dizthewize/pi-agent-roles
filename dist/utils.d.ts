export declare function mkdirpSync(dir: string): void;
export declare function readJSON<T>(filePath: string): T | null;
export declare function writeJSON(filePath: string, data: unknown): void;
export declare function removeFile(filePath: string): void;
export declare function listFiles(dir: string, ext?: string): string[];
export declare function generateHandle(): string;
export declare function nowISO(): string;
export declare function durationMs(start: string): number;
export declare function pruneOldDispatches(dir: string, maxAgeMs?: number): number;
/**
 * Build a prompt that includes file contents as context.
 */
export declare function buildFileContext(files: string[]): string;
//# sourceMappingURL=utils.d.ts.map