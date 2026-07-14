# Small Hardening Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four small known gaps: nested-object log redaction, a hard server-level request-body cap, removal of dead CSRF/session helpers, and stale workspace globs.

**Architecture:** Independent slices; each task stands alone and can be merged separately. No behavior outside the named gap changes.

**Tech Stack:** Bun, Hono, bun test.

## Global Constraints

- No `as` casts; arrow functions for new standalone functions; enums for closed values.
- Every change here is security-adjacent: each task carries a regression test (AGENTS.md rule).

---

### Task 1: Recursive log redaction

**Files:**
- Modify: `apps/api/src/runtime/logger.ts:53-59`
- Test: `apps/api/src/runtime/__tests__/logger.test.ts` (create if absent; if an existing logger test file lives elsewhere, extend it instead)

**Interfaces:**
- Produces: unchanged public API (`logInfo`, `logWarn`, `logError`, `auditLog`); redaction now applies to nested plain objects and arrays up to depth 4.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/runtime/__tests__/logger.test.ts
import { describe, expect, test, spyOn } from "bun:test";

import { logInfo } from "../logger";

describe("logger redaction", () => {
  test("redacts secret-named fields inside nested objects and arrays", () => {
    const spy = spyOn(console, "info").mockImplementation(() => {});
    logInfo("nested", {
      request: {
        headers: { authorization: "Bearer abc", accept: "application/json" },
        clients: [{ clientSecret: "s3cret", name: "demo" }]
      }
    });
    const line = spy.mock.calls[0]?.[0];
    spy.mockRestore();
    if (typeof line !== "string") {
      throw new Error("expected a serialized log line");
    }
    expect(line).not.toContain("Bearer abc");
    expect(line).not.toContain("s3cret");
    expect(line).toContain("[redacted]");
    expect(line).toContain("application/json");
    expect(line).toContain("demo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test runtime/__tests__/logger.test.ts`
Expected: FAIL — `Bearer abc` present in output (top-level-only redaction).

- [ ] **Step 3: Make redaction recursive**

Replace `redactFields` in `apps/api/src/runtime/logger.ts`:

```ts
const MAX_REDACTION_DEPTH = 4;

const redactFields = (fields: LogFields) => {
  return redactValue(fields, 0) as LogFields;
};

const redactValue = (value: unknown, depth: number): unknown => {
  if (depth >= MAX_REDACTION_DEPTH || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = SECRET_FIELD_PATTERN.test(key)
      ? "[redacted]"
      : redactValue(entry, depth + 1);
  }
  return redacted;
};
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && bun test runtime/__tests__/logger.test.ts && cd ../.. && bun run test`
Expected: PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/runtime/logger.ts apps/api/src/runtime/__tests__/logger.test.ts
git commit -m "fix(api): redact secret fields recursively in structured logs"
```

### Task 2: Hard server-level request-body cap

**Files:**
- Modify: `apps/api/src/index.ts:9-23`
- Create: `apps/api/src/http/server-limits.ts`
- Test: `apps/api/src/http/__tests__/server-limits.test.ts`

**Interfaces:**
- Produces: `MAX_REQUEST_BODY_BYTES: number` exported from `apps/api/src/http/server-limits.ts`, wired into `Bun.serve({ maxRequestBodySize })`. Value: `MAX_MEDIA_UPLOAD_BODY_BYTES` from `@nezdemkovski/auth-storage` (2.5 MiB) — the largest legitimate request body the API accepts. Bodies above it are rejected by Bun at the socket layer regardless of the Content-Length header, closing the "small declared length, huge actual body" buffering gap.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/http/__tests__/server-limits.test.ts
import { describe, expect, test } from "bun:test";
import { MAX_MEDIA_UPLOAD_BODY_BYTES } from "@nezdemkovski/auth-storage";

import { MAX_REQUEST_BODY_BYTES } from "../server-limits";

describe("server limits", () => {
  test("request body cap matches the largest legitimate upload body", () => {
    expect(MAX_REQUEST_BODY_BYTES).toBe(MAX_MEDIA_UPLOAD_BODY_BYTES);
  });

  test("oversized bodies are rejected at the server layer", async () => {
    const server = Bun.serve({
      port: 0,
      maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
      fetch: async (request) => {
        await request.arrayBuffer();
        return new Response("ok");
      }
    });
    try {
      const oversized = new Uint8Array(MAX_REQUEST_BODY_BYTES + 1);
      const response = await fetch(server.url, {
        method: "POST",
        body: oversized
      });
      expect(response.status).toBe(413);
    } finally {
      server.stop(true);
    }
  });
});
```

Check first that `MAX_MEDIA_UPLOAD_BODY_BYTES` is exported from the storage package root (`packages/domains/storage/src/index.ts`); if it is not, add it to the package's exports in this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test http/__tests__/server-limits.test.ts`
Expected: FAIL — `Cannot find module '../server-limits'`.

- [ ] **Step 3: Implement and wire**

```ts
// apps/api/src/http/server-limits.ts
import { MAX_MEDIA_UPLOAD_BODY_BYTES } from "@nezdemkovski/auth-storage";

export const MAX_REQUEST_BODY_BYTES = MAX_MEDIA_UPLOAD_BODY_BYTES;
```

In `apps/api/src/index.ts` add the option to `Bun.serve`:

```ts
import { MAX_REQUEST_BODY_BYTES } from "./http/server-limits";

const server = Bun.serve({
  port: env.port,
  maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
  fetch(request, server) {
    // existing body unchanged
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && bun test http/__tests__/server-limits.test.ts && cd ../.. && bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/http/server-limits.ts apps/api/src/http/__tests__/server-limits.test.ts apps/api/src/index.ts packages/domains/storage/src/index.ts
git commit -m "fix(api): enforce hard request-body cap at the server layer"
```

### Task 3: Delete dead project CSRF/session helpers

**Files:**
- Delete: `apps/api/src/http/project-csrf.ts` (16 lines, zero non-test importers)
- Delete: `apps/api/src/http/project-session.ts` (86 lines, zero non-test importers)
- Delete: `apps/api/src/http/__tests__/project-csrf.test.ts`
- Delete: `apps/api/src/http/__tests__/project-session.test.ts`

**Interfaces:** none — the modules are imported only by their own tests (verified via grep; project-route CSRF is covered by Better Auth `trustedOrigins`, resource routes are bearer-token based).

- [ ] **Step 1: Re-verify the modules are dead**

Run: `grep -rn "project-csrf\|project-session" apps/api/src --include='*.ts' | grep -v __tests__`
Expected: no output. If any importer appears, STOP and report instead of deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/api/src/http/project-csrf.ts apps/api/src/http/project-session.ts apps/api/src/http/__tests__/project-csrf.test.ts apps/api/src/http/__tests__/project-session.test.ts
```

- [ ] **Step 3: Run the suite**

Run: `bun run typecheck && bun run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(api): remove unused project CSRF/session helpers"
```

### Task 4: Remove stale workspace globs

**Files:**
- Modify: `package.json:47-55` (`workspaces` array)

**Interfaces:** none.

- [ ] **Step 1: Confirm the directories do not exist**

Run: `ls packages/frontend packages/public`
Expected: `No such file or directory` for both. (The `frontend`/`public` *tags* in `turbo.json` boundaries are unrelated to directory globs and stay.)

- [ ] **Step 2: Remove the globs**

In root `package.json`, change `workspaces` to:

```json
"workspaces": [
  "apps/*",
  "packages/*",
  "packages/foundation/*",
  "packages/domains/*",
  "packages/platform/*"
]
```

- [ ] **Step 3: Reinstall and run the suite**

Run: `bun install && git diff --exit-code bun.lock; bun run test`
Expected: install succeeds; if `bun.lock` changed, include it in the commit; tests PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: drop workspace globs for nonexistent directories"
```
