import { describe, it } from "node:test";
import assert from "node:assert";
import { buildContext } from "./context.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"));
}

describe("buildContext", () => {
  it("builds context with no files", () => {
    const ctx = buildContext(
      { id: "a", name: "A", systemPrompt: "You are A" },
      "Do thing"
    );
    assert.strictEqual(ctx.systemPrompt, "You are A");
    assert.ok(ctx.userPrompt.includes("Do thing"));
    assert.deepStrictEqual(ctx.resolvedFiles, []);
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
    assert.ok(ctx.userPrompt.includes("hello.txt"));
    assert.ok(ctx.userPrompt.includes("hello world"));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
