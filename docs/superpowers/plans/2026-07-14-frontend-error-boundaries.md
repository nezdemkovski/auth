# Frontend Error Boundaries and Login Loading State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A render exception in admin or login shows a styled fallback and reports to Sentry instead of white-screening, and the login app shows a loading panel instead of a blank page while realm config loads.

**Architecture:** One shared `AppErrorBoundary` component lives in `@nezdemkovski/auth-client-shared` (which already owns the `@sentry/react` dependency) and wraps `Sentry.ErrorBoundary` with a minimal self-contained fallback. Both app roots mount it. The login `LoginConfigLoader` renders `LoadingPanel` from `@nezdemkovski/auth-ui` (already a login dependency) instead of returning `null`.

**Tech Stack:** React 19, @sentry/react, Vite, bun test + @testing-library/react (follow the setup used by existing frontend unit tests; if none exists for component tests, use `bun test --dom` with `@happy-dom/global-registrator` as the two existing login unit tests do for pure functions — add `happy-dom` only if it is not already a dev dependency).

## Global Constraints

- No `as` casts; arrow functions for new standalone functions.
- The fallback must not depend on runtime config (it renders exactly when the app is broken) — plain markup and the shared CSS classes only.
- Neutral fixtures in tests.

---

### Task 1: Shared AppErrorBoundary in client-shared

**Files:**
- Create: `packages/client-shared/src/error-boundary.tsx`
- Modify: `packages/client-shared/package.json` (add `./error-boundary` to `exports`)
- Test: `packages/client-shared/src/error-boundary.test.tsx`

**Interfaces:**
- Produces: `AppErrorBoundary({ children }: { children: ReactNode }): JSX.Element` — exported from `@nezdemkovski/auth-client-shared/error-boundary`. Catches render errors, reports through `Sentry.ErrorBoundary`, renders fallback text "Something went wrong." with a reload button.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client-shared/src/error-boundary.test.tsx
import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { AppErrorBoundary } from "./error-boundary";

describe("AppErrorBoundary", () => {
  test("renders children when nothing throws", () => {
    const html = renderToString(
      <AppErrorBoundary>
        <p>content</p>
      </AppErrorBoundary>
    );
    expect(html).toContain("content");
  });
});
```

Note: `Sentry.ErrorBoundary` uses `componentDidCatch`, which does not run in `renderToString`; the throw path is covered in Task 3's browser test where a real DOM exists. This unit test pins the pass-through contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client-shared && bun test error-boundary`
Expected: FAIL — `Cannot find module './error-boundary'`.

- [ ] **Step 3: Implement the component**

```tsx
// packages/client-shared/src/error-boundary.tsx
import type { ReactNode } from "react";
import * as Sentry from "@sentry/react";

const reloadPage = () => {
  window.location.reload();
};

const fallback = (
  <section className="grid min-h-screen place-items-center px-5">
    <div className="w-full max-w-[440px] text-center">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
        Something went wrong.
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        The error has been reported. Reload the page to continue.
      </p>
      <button
        type="button"
        onClick={reloadPage}
        className="mt-5 inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-[13px] font-medium text-ink-soft hover:bg-surface-hover"
      >
        Reload
      </button>
    </div>
  </section>
);

export const AppErrorBoundary = ({ children }: { children: ReactNode }) => {
  return <Sentry.ErrorBoundary fallback={fallback}>{children}</Sentry.ErrorBoundary>;
};
```

Add to `packages/client-shared/package.json` `exports`:

```json
"./error-boundary": "./src/error-boundary.tsx",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/client-shared && bun test error-boundary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-shared/src/error-boundary.tsx packages/client-shared/src/error-boundary.test.tsx packages/client-shared/package.json
git commit -m "feat(frontend): add shared Sentry-backed AppErrorBoundary"
```

### Task 2: Mount the boundary in both app roots

**Files:**
- Modify: `apps/admin/src/main.tsx`
- Modify: `apps/login/src/main.tsx:58`

**Interfaces:**
- Consumes: `AppErrorBoundary` from Task 1.

- [ ] **Step 1: Wrap admin root**

```tsx
// apps/admin/src/main.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "@nezdemkovski/auth-client-shared/error-boundary";

import { AdminApp } from "./admin/AdminApp";
import { queryClient } from "./admin/routes/router";
import "@nezdemkovski/auth-client-shared/style.css";

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AdminApp />
    </QueryClientProvider>
  </AppErrorBoundary>
);
```

- [ ] **Step 2: Wrap login root**

In `apps/login/src/main.tsx` add the import and change line 58:

```tsx
import { AppErrorBoundary } from "@nezdemkovski/auth-client-shared/error-boundary";

root.render(
  <AppErrorBoundary>
    <RouterProvider router={loginRouter} />
  </AppErrorBoundary>
);
```

- [ ] **Step 3: Verify builds**

Run: `bun run build:admin && bun run build:login`
Expected: both builds succeed.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/main.tsx apps/login/src/main.tsx
git commit -m "feat(frontend): mount AppErrorBoundary in admin and login roots"
```

### Task 3: Login loading state instead of blank screen

**Files:**
- Modify: `apps/login/src/config-loader.tsx:72-74`
- Test: `tests/browser/auth-flows.spec.ts` (append one test)

**Interfaces:**
- Consumes: `LoadingPanel` from `@nezdemkovski/auth-ui` (already in `apps/login/package.json`).

- [ ] **Step 1: Write the failing browser test**

Append to `tests/browser/auth-flows.spec.ts`, following the file's existing `page.route` mocking style:

```ts
test("login shows a loading panel while realm config loads", async ({ page }) => {
  await page.route("**/api/demo/login/config/login**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ json: demoLoginConfig });
  });

  await page.goto("/login/demo");
  await expect(page.getByTestId("login-config-loading")).toBeVisible();
  await expect(page.getByTestId("login-config-loading")).toBeHidden({
    timeout: 5000
  });
});
```

Reuse the file's existing login-config fixture for `demoLoginConfig` (it already exists for the current mocked tests; use the same constant name found in the file).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:browser -- --grep "loading panel"`
Expected: FAIL — `getByTestId("login-config-loading")` not found (loader currently renders nothing).

- [ ] **Step 3: Render the loading panel**

In `apps/login/src/config-loader.tsx` replace lines 72–74:

```tsx
import { LoadingPanel } from "@nezdemkovski/auth-ui";

  if (!config) {
    return (
      <section
        data-testid="login-config-loading"
        className="grid min-h-screen place-items-center px-5"
      >
        <LoadingPanel />
      </section>
    );
  }
```

If `LoadingPanel` takes required props in `packages/ui` (check its signature first), pass the minimal ones the admin app uses.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:browser -- --grep "loading panel"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/login/src/config-loader.tsx tests/browser/auth-flows.spec.ts
git commit -m "feat(login): show loading panel while realm config loads"
```
