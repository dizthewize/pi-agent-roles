import * as fs from "node:fs";
import * as path from "node:path";
import { readJSON, writeJSON } from "../utils.js";
export class RoleStore {
    file;
    constructor(opts) {
        this.file = opts.rolesFile;
        this.ensureFile();
    }
    ensureFile() {
        if (!fs.existsSync(path.dirname(this.file))) {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
        }
        if (!fs.existsSync(this.file)) {
            writeJSON(this.file, []);
        }
    }
    read() {
        return readJSON(this.file) ?? [];
    }
    write(roles) {
        writeJSON(this.file, roles);
    }
    list() {
        return this.read();
    }
    get(id) {
        return this.read().find((r) => r.id === id) ?? null;
    }
    create(role) {
        const roles = this.read();
        if (roles.find((r) => r.id === role.id))
            return false;
        roles.push(role);
        this.write(roles);
        return true;
    }
    update(id, patch) {
        const roles = this.read();
        const idx = roles.findIndex((r) => r.id === id);
        if (idx === -1)
            return false;
        roles[idx] = { ...roles[idx], ...patch };
        this.write(roles);
        return true;
    }
    delete(id) {
        const roles = this.read();
        const idx = roles.findIndex((r) => r.id === id);
        if (idx === -1)
            return false;
        roles.splice(idx, 1);
        this.write(roles);
        return true;
    }
}
//# sourceMappingURL=store.js.map