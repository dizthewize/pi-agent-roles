import { Dispatcher } from "./dispatch.js";
import { RoleStore } from "./store.js";
import { ExecuteBackend } from "./dispatch.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect } from "vitest";

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
    expect(result.status).toBe("complete");
    expect(result.exitCode).toBe(0);
    expect(result.output!.includes("task")).toBe(true);
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
    expect(handle.startsWith("d-")).toBe(true);

    // Immediately after returning, status is running
    const status = d.getStatus(handle);
    expect(status?.status).toBe("running");

    // Wait for background to complete
    await new Promise((r) => setTimeout(r, 100));
    const final = d.getStatus(handle);
    expect(final?.status).toBe("complete");
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
    expect(result.status).toBe("timeout");
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
    expect(d.cancel(handle)).toBe(true);
    const rec = d.getStatus(handle);
    expect(rec?.status).toBe("cancelled");
    expect(d.cancel(handle)).toBe(false); // already cancelled
  });

  it("throws on unknown role", async () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    const d = new Dispatcher({
      store,
      dispatchesDir: path.join(tmp, "dispatches"),
      defaultTimeoutSeconds: 300,
    });

    await expect(async () => d.dispatchBlocking("ghost", "t", [], mockBackend)).rejects.toThrow(/Role not found/);
  });
});
