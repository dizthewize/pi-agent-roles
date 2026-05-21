# pi-agent-roles Usage Snippets

## Quick Dispatch Patterns

### Security Audit (blocking)
```typescript
pi_roles({
  action: "dispatch",
  roleId: "security-auditor",
  task: "Audit src/auth.ts for timing attacks, missing input validation, and insecure token handling. Report severity and fix suggestions.",
  files: ["src/auth.ts", "src/token.ts"],
  mode: "blocking",
});
```

### Async Documentation
```typescript
const { handle } = await pi_roles({
  action: "dispatch",
  roleId: "doc-writer",
  task: "Write README for the new auth module including setup, env vars, and API endpoints.",
  files: ["src/auth/"],
  mode: "async",
});
// Poll later...
pi_roles({ action: "status", handle });
pi_roles({ action: "result", handle });
```

### Performance Profiling
```typescript
pi_roles({
  action: "dispatch",
  roleId: "performance-analyst",
  task: "Profile the login endpoint under load. Identify N+1 queries, missing indexes, and slow renders. Quantify before/after estimates.",
  files: ["src/routes/login.ts", "src/services/user.ts"],
  mode: "blocking",
});
```

### Accessibility Check
```typescript
pi_roles({
  action: "dispatch",
  roleId: "accessibility-auditor",
  task: "Audit the login form for WCAG 2.1 compliance. Check keyboard navigation, screen reader labels, contrast ratios, and focus management.",
  files: ["src/components/LoginForm.tsx"],
  mode: "blocking",
  context: "fresh"
});
```

## Mesh Delegation

Send a role task to another agent in the mesh:

```typescript
pi_mesh({ action: "join", name: "swift-raven-42" })
pi_roles({
  action: "dispatch",
  roleId: "code-reviewer",
  task: "Review the auth PR",
  meshTarget: "swift-raven-42",
  mode: "blocking",
});
```

## Role Definition Template

```typescript
pi_roles({
  action: "create",
  roleId: "my-custom-role",
  name: "My Custom Role",
  systemPrompt: `You are a specialist in...

Rules:
1. Always verify X before Y
2. Report findings in JSON format
3. Flag anything above severity 3`,
  model: "default",
  timeoutSeconds: 300,
  context: "fork",
});
```
