import * as fs from "node:fs";
import * as path from "node:path";
import { AgentRole } from "../types.js";
import { readJSON, writeJSON } from "../utils.js";

export interface StoreOptions {
  rolesFile: string;
}

export class RoleStore {
  private file: string;

  constructor(opts: StoreOptions) {
    this.file = opts.rolesFile;
    this.ensureFile();
  }

  private ensureFile(): void {
    if (!fs.existsSync(path.dirname(this.file))) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    }
    if (!fs.existsSync(this.file)) {
      writeJSON(this.file, []);
    }
  }

  private read(): AgentRole[] {
    return readJSON<AgentRole[]>(this.file) ?? [];
  }

  private write(roles: AgentRole[]): void {
    writeJSON(this.file, roles);
  }

  list(): AgentRole[] {
    return this.read();
  }

  get(id: string): AgentRole | null {
    return this.read().find((r) => r.id === id) ?? null;
  }

  create(role: AgentRole): boolean {
    const roles = this.read();
    if (roles.find((r) => r.id === role.id)) return false;
    roles.push(role);
    this.write(roles);
    return true;
  }

  update(id: string, patch: Partial<Omit<AgentRole, "id">>): boolean {
    const roles = this.read();
    const idx = roles.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    roles[idx] = { ...roles[idx], ...patch };
    this.write(roles);
    return true;
  }

  delete(id: string): boolean {
    const roles = this.read();
    const idx = roles.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    roles.splice(idx, 1);
    this.write(roles);
    return true;
  }
}
