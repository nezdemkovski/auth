# CI Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Images can no longer be published while integration or browser tests are red — the full verification suite gates the release artifact.

**Architecture:** Convert `integration-tests.yml` into a reusable workflow (`workflow_call`) and make `publish-image.yml` run it as a `verify` job that the `publish` job `needs`. The duplicated typecheck/test steps inside `publish` are removed because `verify` runs the canonical suite. Push-triggered standalone integration runs are narrowed to test-only paths so master pushes don't run the suite twice.

**Tech Stack:** GitHub Actions (reusable workflows), Bun, Playwright.

## Global Constraints

- All third-party actions stay pinned to 40-char commit SHAs (enforced by `tests/repository-controls.test.ts`). Local reusable-workflow references (`uses: ./.github/workflows/...`) are not third-party and need no SHA.
- The publish workflow must keep refusing mutable tags and emitting SBOM/provenance — do not touch those steps.
- CI changes cannot be exercised locally; each task's verification is `bun test tests/repository-controls.test.ts` plus observing a real workflow run on a branch PR.

---

### Task 1: Make integration-tests.yml callable

**Files:**
- Modify: `.github/workflows/integration-tests.yml:3-28` (triggers only)

**Interfaces:**
- Produces: workflow callable via `uses: ./.github/workflows/integration-tests.yml` with no inputs/secrets required.

- [ ] **Step 1: Edit triggers**

Replace the `on:` block (lines 3–28) with:

```yaml
on:
  workflow_call:
  pull_request:
    paths:
      - package.json
      - bun.lock
      - turbo.json
      - tsconfig*.json
      - apps/**
      - packages/**
      - .github/workflows/integration-tests.yml
      - .github/workflows/publish-sdk.yml
      - playwright.config.ts
      - tests/browser/**
  push:
    branches: [master]
    paths:
      - playwright.config.ts
      - tests/browser/**
      - .github/workflows/integration-tests.yml
```

The `push` paths shrink to test-infrastructure files that do not trigger `publish-image.yml`; app/package changes on master are covered by the `verify` job added in Task 2. The `pull_request` trigger is unchanged.

- [ ] **Step 2: Run the repository controls test**

Run: `bun test tests/repository-controls.test.ts`
Expected: PASS (no third-party action changed).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/integration-tests.yml
git commit -m "ci: make integration tests reusable via workflow_call"
```

### Task 2: Gate image publishing on the verification suite

**Files:**
- Modify: `.github/workflows/publish-image.yml:24-43`

**Interfaces:**
- Consumes: the `workflow_call` trigger from Task 1.

- [ ] **Step 1: Add the verify job and wire needs**

Replace the top of the `jobs:` section (lines 24–43) so the file reads:

```yaml
jobs:
  verify:
    uses: ./.github/workflows/integration-tests.yml

  publish:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
        with:
          bun-version: 1.3.14

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3
```

Deletions relative to today: the `Typecheck` (`bun run typecheck`) and `Test` (`bun run test`) steps inside `publish` — the reusable workflow runs `bunx turbo run build typecheck test --affected`, the canonical `bun run test`, the integration suite, and the browser suite. Everything from `Login to GHCR` down stays byte-identical.

- [ ] **Step 2: Run the repository controls test**

Run: `bun test tests/repository-controls.test.ts`
Expected: PASS. If it asserts on the exact step list of `publish-image.yml`, update the assertion to the new job layout in the same commit and re-run.

- [ ] **Step 3: Verify on a real run**

```bash
git checkout -b ci/release-gate
git push -u origin ci/release-gate
gh pr create --title "ci: gate image publish on integration and browser tests" --body "publish-image now needs the reusable integration-tests workflow." --draft
gh run watch
```

Expected: the PR run executes `integration-tests` (pull_request trigger) green. After merge to master, `gh run view` on the Publish Image run must show two jobs — `verify / test` completing before `publish` starts.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish-image.yml tests/repository-controls.test.ts
git commit -m "ci: gate image publish on integration and browser suites"
```
