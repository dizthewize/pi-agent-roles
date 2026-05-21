import { describe, it } from "node:test";
import assert from "node:assert";
import { Dispatcher } from "./dispatch.js";
import { RoleStore } from "./store.js";
import { ExecuteBackend } from "./dispatch.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-test-"));
}

const mockBackend: ExecuteBackend = {
  async run({ task }) {
    await new Promise((r) => setTimeout(r, 10));
    return { output: `Result: ${task}`, exitCode: 0, durationMs: 10 };
  },
};

const timeoutBackend: ExecuteBackend = {
  async run() {
    await new Promise((r) => setTimeout(r, 9999));
    return { output: "never", exitCode: 0, durationMs: 9999 };
  },
};

describe("Dispatcher", () => {
  it("dispatches blocking and returns result", async () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "r", name: "R", systemPrompt: "Prompt" });

    const d = new Dispatcher({
      store,
      dispatchesDir: path.join(tmp, "dispatches"),
      defaultTimeoutSeconds: 300,
    });

    const result = await d.dispatchBlocking("r", "task", [], mockBackend);
    assert.strictEqual(result.status, "complete");
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.output!.includes("task"));
  });

  it("dispatches async and returns handle immediately", async () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "r", name: "R", systemPrompt: "Prompt" });

    const d = new Dispatcher({
      store,
      dispatchesDir: path.join(tmp, "dispatches"),
      defaultTimeoutSeconds: 300,
    });

    const { handle } = await d.dispatchAsync("r", "task", [], mockBackend);
    assert.ok(handle.startsWith("d-"));

    // Immediately after returning, status is running
    const status = d.getStatus(handle);
    assert.strictEqual(status?.status, "running");

    // Wait for background to complete
    await new Promise((r) => setTimeout(r, 100));
    const final = d.getStatus(handle);
    assert.strictEqual(final?.status, "complete");
  });

  it("handles timeout in blocking mode", async () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "r", name: "R", systemPrompt: "Prompt", timeoutSeconds: 0 });

    const d = new Dispatcher({
      store,
      dispatchesDir: path.join(tmp, "dispatches"),
      defaultTimeoutSeconds: 300,
    });

    const result = await d.dispatchBlocking("r", "task", [], timeoutBackend);
    assert.strictEqual(result.status, "timeout");
  });

  it("cancels a running dispatch", async () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "r", name: "R", systemPrompt: "Prompt" });

    const d = new Dispatcher({
      store,
      dispatchesDir: path.join(tmp, "dispatches"),
      defaultTimeoutSeconds: 300,
    });

    const { handle } = await d.dispatchAsync("r", "slow", [], timeoutBackend);
    assert.strictEqual(d.cancel(handle), true);
    const rec = d.getStatus(handle);
    assert.strictEqual(rec?.status, "cancelled");
    assert.strictEqual(d.cancel(handle), false); // already cancelled
  });

  it("throws on unknown role", async () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    const d = new Dispatcher({
      store,
      dispatchesDir: path.join(tmp, "dispatches"),
      defaultTimeoutSeconds: 300,
    });

    await assert.rejects(
      async () => d.dispatchBlocking("ghost", "t", [], mockBackend),
      /Role not found/
    );
  });
});
