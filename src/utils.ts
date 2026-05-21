import * as fs from "node:fs";
import * as path from "node:path";
import { DispatchResult } from "./types.js";

export function mkdirpSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  mkdirpSync(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function removeFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch { /* ignore */ }
}

export function listFiles(dir: string, ext?: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => (ext ? f.endsWith(ext) : true))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export function generateHandle(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `d-${ts}-${rand}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function durationMs(start: string): number {
  return Date.now() - new Date(start).getTime();
}

export function pruneOldDispatches(dir: string, maxAgeMs = 604_800_000): number {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const file of listFiles(dir, ".json")) {
    try {
      const rec = readJSON<DispatchResult>(file);
      if (!rec) continue;
      const ts = new Date(rec.startedAt).getTime();
      if (ts < cutoff) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch { /* ignore */ }
  }
  return removed;
}

/**
 * Build a prompt that includes file contents as context.
 */
export function buildFileContext(files: string[]): string {
  const parts: string[] = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, "utf-8");
      parts.push(`\n--- ${path.basename(f)} (${f}) ---\n${content}\n---\n`);
    } catch {
      parts.push(`\n--- ${path.basename(f)} (${f}) ---\n[Could not read file]\n---\n`);
    }
  }
  return parts.join("");
}
