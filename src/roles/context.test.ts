import { buildContext } from "./context.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect } from "vitest";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"));
}

describe("buildContext", () => {
  it("builds context with no files", () => {
    const ctx = buildContext(
      { id: "a", name: "A", systemPrompt: "You are A" },
      "Do thing"
    );
    expect(ctx.systemPrompt).toBe("You are A");
    expect(ctx.userPrompt.includes("Do thing")).toBe(true);
    expect(ctx.resolvedFiles).toStrictEqual([]);
  });

  it("includes file contents", () => {
    const tmp = tmpDir();
    const f = path.join(tmp, "hello.txt");
    fs.writeFileSync(f, "hello world", "utf-8");

    const ctx = buildContext(
      { id: "a", name: "A", systemPrompt: "You are A" },
      "Do thing",
      [f]
    );
    expect(ctx.userPrompt.includes("hello.txt")).toBe(true);
    expect(ctx.userPrompt.includes("hello world")).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
