import { RoleStore } from "./store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect } from "vitest";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "roles-store-test-"));
}

describe("RoleStore", () => {
  it("creates file on first use", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    const list = store.list();
    expect(list).toStrictEqual([]);
  });

  it("creates a role", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    expect(store.create({ id: "security", name: "Security", systemPrompt: "Audit" })).toBe(true);
    expect(store.get("security")?.name).toBe("Security");
  });

  it("refuses duplicate ids", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "x", name: "X", systemPrompt: "x" });
    expect(store.create({ id: "x", name: "Y", systemPrompt: "y" })).toBe(false);
  });

  it("updates a role", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "x", name: "X", systemPrompt: "x" });
    expect(store.update("x", { name: "Y" })).toBe(true);
    expect(store.get("x")?.name).toBe("Y");
    expect(store.update("ghost", { name: "Z" })).toBe(false);
  });

  it("deletes a role", () => {
    const tmp = tmpDir();
    const store = new RoleStore({ rolesFile: path.join(tmp, "roles.json") });
    store.create({ id: "x", name: "X", systemPrompt: "x" });
    expect(store.delete("x")).toBe(true);
    expect(store.get("x")).toBe(null);
    expect(store.delete("x")).toBe(false);
  });
});
