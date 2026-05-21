import { AgentRole } from "../types.js";
export interface StoreOptions {
    rolesFile: string;
}
export declare class RoleStore {
    private file;
    constructor(opts: StoreOptions);
    private ensureFile;
    private read;
    private write;
    list(): AgentRole[];
    get(id: string): AgentRole | null;
    create(role: AgentRole): boolean;
    update(id: string, patch: Partial<Omit<AgentRole, "id">>): boolean;
    delete(id: string): boolean;
}
//# sourceMappingURL=store.d.ts.map