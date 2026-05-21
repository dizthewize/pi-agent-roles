import { describe, it } from "node:test";
import assert from "node:assert";
import { RoleStore } from "./store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "roles-store-test-"));
}

describe("RoleStore", () => {
  it("creates file on first use", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    const list = store.list();
    assert.deepStrictEqual(list, []);
  });

  it("creates a role", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    assert.strictEqual(
      store.create({ id: "security", name: "Security", systemPrompt: "Audit" }),
      true
    );
    assert.strictEqual(store.get("security")?.name, "Security");
  });

  it("refuses duplicate ids", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "x", name: "X", systemPrompt: "x" });
    assert.strictEqual(store.create({ id: "x", name: "Y", systemPrompt: "y" }), false);
  });

  it("updates a role", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "x", name: "X", systemPrompt: "x" });
    assert.strictEqual(store.update("x", { name: "Y" }), true);
    assert.strictEqual(store.get("x")?.name, "Y");
    assert.strictEqual(store.update("ghost", { name: "Z" }), false);
  });

  it("deletes a role", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "x", name: "X", systemPrompt: "x" });
    assert.strictEqual(store.delete("x"), true);
    assert.strictEqual(store.get("x"), null);
    assert.strictEqual(store.delete("x"), false);
  });
});
