# pi-agent-roles

Lightweight role-based delegation for Pi. Define reusable agent personas, dispatch tasks to them (blocking or async), and retrieve results.

## Install

```bash
pi package add pi-agent-roles
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Role** | A reusable persona: system prompt + model + skills + tools + timeout |
| **Dispatch** | A single task sent to a role, tracked by a handle (`d-abc123`) |
| **Blocking** | Dispatch, wait for completion, return output immediately |
| **Async** | Dispatch in background, return handle immediately, poll later |

## Quick Start

```typescript
// 1. Define a role
pi_roles({
  action: "create",
  roleId: "security-auditor",
  name: "Security Auditor",
  systemPrompt: "You are a security auditor...",
  model: "opencode-go/claude-opus",
  timeoutSeconds: 300,
});

// 2. Dispatch a task (blocking)
const result = await pi_roles({
  action: "dispatch",
  roleId: "security-auditor",
  task: "Audit src/auth.ts for timing attacks",
  files: ["src/auth.ts"],
  mode: "blocking",
});
// result includes: status, output, duration, exit code

// 3. Dispatch async
const { handle } = await pi_roles({
  action: "dispatch",
  roleId: "doc-writer",
  task: "Write README",
  files: ["src/"],
  mode: "async",
});

// 4. Poll status
const status = await pi_roles({ action: "status", handle });
// status.status -> "running" | "complete" | "failed" | "timeout" | "cancelled"

// 5. Fetch result when done
const final = await pi_roles({ action: "result", handle });
```

## All Actions

| Action | Required params | Description |
|--------|----------------|-------------|
| `list` | — | Show all roles |
| `show` | `roleId` | Show one role |
| `create` | `roleId`, `name`, `systemPrompt` | Create a new role |
| `update` | `roleId` + any fields | Patch a role |
| `delete` | `roleId` | Delete a role |
| `dispatch` | `roleId`, `task`, `mode` | Start a dispatch |
| `status` | `handle` | Check dispatch status |
| `cancel` | `handle` | Cancel a running dispatch |
| `result` | `handle` | Fetch completed output |

## Blocking vs Async

- **Blocking** (default): `mode` omitted or `"blocking"`. Waits for the role to finish, subject to `timeoutSeconds`. Good for quick tasks.
- **Async**: `mode: "async"`. Returns a handle immediately. Background job runs independently. Poll `status` / `result` to check progress. Good for long-running tasks.

## Role Defaults

| Field | Default | Notes |
|-------|---------|-------|
| `context` | `"fork"` | `"fork"` shares project context; `"fresh"` is isolated |
| `timeoutSeconds` | `300` (blocking), `600` (async) | Per-role override or global default |
| `model` | Pi default | Specific model for this role |
| `skills` | none | Skill names to inject |
| `outputDir` | none | Where artifacts are placed |

## Storage

- Roles: `~/.pi/agent/roles.json`
- Dispatches: `~/.pi/agent/dispatches/d-<handle>.json` (auto-purged after 7 days)

## Built-In Roles

`pi-agent-roles` ships with **21 pre-built roles** covering common development tasks:

| Role ID | Purpose |
|---------|---------|
| `planner` | Convert PRD → TASK-XX spec for `pi-workflows` |
| `codebase-explorer` | Map code structure, patterns, conventions |
| `compliance-mapper` | Check project standards and rules |
| `requirements-mapper` | Break tasks into testable requirements |
| `design-system-integrator` | Frontend component + theme analysis |
| `api-contract-designer` | Design exact API contracts (endpoints, JSON, SSE) |
| `db-schema-designer` | Design database schemas and migrations |
| `security-auditor` | Security review with severity ratings |
| `code-reviewer` | Code review with verdict (APPROVE/NEEDS_CHANGES/CHALLENGE) |
| `doc-writer` | README, API docs, changelog |
| `qa-engineer` | Test plans, edge cases, regression risks |
| `bug-reproducer` | Step-by-step bug reproduction from issues |
| `performance-analyst` | Profile code, find bottlenecks, quantify fixes |
| `accessibility-auditor` | WCAG compliance, keyboard nav, screen readers |
| `integration-tester` | Cross-component validation, API contract alignment |
| `deployment-engineer` | Docker, CI/CD, rollback plans, monitoring |
| `tech-debt-analyst` | Modernization, DRY, complexity hotspots |
| `observability-engineer` | Logging, metrics, tracing, alerting |
| `dependency-auditor` | CVEs, licenses, outdated packages, bundle bloat |
| `localization-engineer` | i18n, RTL, pluralization |
| `ux-researcher` | User flows, friction points, mobile-first, competitive analysis |

Load roles from the shipped `default-roles.json`:
```bash
cp node_modules/pi-agent-roles/default-roles.json ~/.pi/agent/roles.json
```

Or create your own:
```typescript
pi_roles({
  action: "create",
  roleId: "my-reviewer",
  name: "My Reviewer",
  systemPrompt: "You review with focus on...",
  model: "claude-opus",
  context: "fresh",
});
```

## Mesh Delegation

Dispatch a role task to a **remote mesh agent**:

```typescript
pi_roles({
  action: "dispatch",
  roleId: "security-auditor",
  task: "Audit auth.ts",
  meshTarget: "swift-raven-42",  // agent id or name in mesh
});
```

The remote agent receives the task as a mesh DM and executes it. Results are polled via `status`.

## Fallback

If `pi.subagent()` is unavailable (e.g., older Pi version), `pi_roles` falls back to returning the assembled system prompt + task as output, so you can run it manually or through an external tool.

## Inter-Extension Bridges

`pi-agent-roles` exposes EventBus endpoints for other extensions:

| Channel | Direction | Description |
|---------|-----------|-------------|
| `roles:dispatch:request` | in | Other extensions dispatch a role task |
| `roles:status:request` | in | Query dispatch status by handle |

Used by `pi-workflows` (agent spawning) and `pi-dark-factory` (planning, review) when available.
