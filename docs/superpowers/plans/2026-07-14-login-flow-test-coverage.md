# Login Flow Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> NOTE (2026-07-14): written before ADR-0002 landed. The harness's realm clients should be created with the current client profiles (the primary app client is now a public SPA client); adjust `createRealmClient` profiles accordingly when executing. The flow coverage itself is unaffected.

**Goal:** Close the login-flow test gap in `/Users/yuri/Sites/auth`: (a) unit tests for the hosted-login state machine and actions (`apps/login/src/hooks/loginFlowState.ts` + `useLoginFlowActions.ts`) against a faked auth-client boundary, and (b) real-stack Playwright tests (real API + real Postgres/Redis from `dev/docker-compose.integration.yml`, no `page.route` mocks) for email sign-in, sign-up + email verification, password reset, TOTP 2FA enroll + verify, passkey enroll + sign-in via a CDP virtual authenticator, and OAuth consent approve/deny.

**Architecture:**
- **Unit layer:** extract the 309-line `useLoginFlowActions` hook body into a pure factory `createLoginFlowActions` (new `apps/login/src/hooks/loginFlowActions.ts`) that depends on a narrow structural `LoginFlowGateway` interface plus an injected `navigate` function. A `createLoginFlowGateway(authClient, config)` adapter in `apps/login/src/auth-client.ts` implements the gateway with the real better-auth client. The hook becomes a thin binding layer (`useMemo` for the gateway, `useCallback` for the two effect-stable actions). Unit tests fake the gateway with plain objects (no `as` casts) and assert state transitions by replaying dispatched actions through `loginFlowReducer`.
- **Browser layer:** a new **browser-test harness server** `apps/api/integration/browser-server.ts` (started as a third Playwright `webServer`) boots the real API (`createIntegrationApp`) against the integration compose stack with `publicBaseUrl = http://127.0.0.1:5174`. The existing login Vite dev server on `127.0.0.1:5174` already proxies `/api → 127.0.0.1:3000` (`apps/login/vite.config.ts`), so the browser sees **one origin** serving `/login/*` (Vite) and `/api/*` (harness API) — exactly mirroring `dev/Caddyfile` routing. That single origin also makes WebAuthn work, because the passkey plugin derives `rpID`/`origin` from `publicBaseUrl`. The harness seeds three realms (`demo`, `demo-2fa`, `demo-passkey`), registers OAuth clients, captures Resend email sends in-process (same trick as `apps/api/integration/email-flows.integration.ts`), and exposes test-only `/__test__/*` routes (captured mailbox, TOTP code computation via `ProjectAuth.api.generateTOTP`, verified-user seeding, seeded client IDs). Tests drive the **real OAuth journey**: `GET /api/<realm>/auth/oauth2/authorize` → hosted login with signed query → sign-in → server-side resume → client callback URL with `code`.
- **Known product defect this plan fixes en route:** TOTP enrollment happens on the post-login page after a full-page redirect, so `flow.verifiedPassword` is always `null` there, and better-auth's `twoFactor.enable` requires the password for credential users (`shouldRequirePassword` returns true — verified in the pinned better-auth). Task 3 adds a password fallback to the action; Task 8 adds the password field to the enroll step so the browser test can pass.

**Tech Stack:** Bun test (`bun test`) for unit tests, Playwright (`bun run test:browser`) for browser tests, Docker compose integration stack (`bun run test:integration:up`), Chrome DevTools Protocol `WebAuthn.*` for the virtual authenticator, `ProjectAuth.api.generateTOTP` for TOTP codes.

## Global Constraints

- READ the repo rules in `/Users/yuri/Sites/auth/AGENTS.md` first. In particular: TDD (one failing test at a time), no `as`/type assertions anywhere (including tests), arrow functions for standalone functions, neutral fixtures only (`demo`, `Demo App`, `user@example.com`), extract helpers on second duplication.
- **Prerequisite for all browser tasks:** the integration stack must be running: `bun run test:integration:up`. Tear down with `bun run test:integration:down`. Make sure nothing else (e.g. the dev API) is listening on port 3000, or Playwright will reuse it and the `/__test__/*` routes will be missing.
- The harness server **resets the integration database on boot** (`resetAndBootstrapIntegrationDatabase`) — never point it at a real database. All test-only routes live under `/__test__/` in `apps/api/integration/browser-server.ts` only; no test hooks in `apps/api/src/**`.
- Browser tests run in parallel against one shared harness: every test must create its own user via `uniqueEmail(...)`; never clear the shared mailbox from a test; filter emails by recipient.
- **Social sign-in is explicitly out of scope**: it requires a real external IdP round-trip. It stays covered at the unit level only (`startSocialSignIn` in Task 3). This note is repeated as a comment at the top of `tests/browser/support/harness.ts`.
- The 5 existing mocked specs in `tests/browser/auth-flows.spec.ts` must keep passing unchanged after every task.
- Verify commands after each task: `bun run typecheck`, `cd apps/login && bun test`, `bun run test:browser` (browser tasks only).

### Task 1: Characterization unit tests for the login flow reducer
**Files:**
- Create: `apps/login/src/hooks/loginFlowState.test.ts`

**Interfaces:** Consumes `initialLoginFlowState(error, lastLoginMethod)`, `loginFlowReducer(state, action)` from `apps/login/src/hooks/loginFlowState.ts`.

Tests (characterization; introduce one deliberately wrong assertion first to prove the tests execute, then correct it):
- starts on the credentials step with the server-provided error and last method
- two-factor setup stores the TOTP uri and backup codes without losing the step (`set-step` → `two-factor-enroll`, then `set-two-factor-setup`)
- a verified password can be recorded and cleared (`set-verified-password` with a string, then null)
- errors and pending flags do not reset typed credentials (`set-email`, `set-password`, `set-pending`, `set-error` sequence)

Run: `cd apps/login && bun test src/hooks/loginFlowState.test.ts`. Commit: `test: characterize the hosted login flow reducer`.

### Task 2: Extract pure login flow actions behind a faked gateway
**Files:**
- Create: `apps/login/src/hooks/loginFlowActions.ts`, `apps/login/src/hooks/loginFlowActions.test.ts`

**Interfaces produced:**
```ts
export type LoginFlowGateway = {
  signInWithEmail(input: { email: string; password: string }): Promise<{ ok: true; twoFactorRedirect: boolean } | { ok: false }>;
  signUpWithEmail(input: { email: string; password: string }): Promise<boolean>;
  signInWithSocial(input: { provider: SocialProviderId }): Promise<boolean>;
  signInWithPasskey(): Promise<{ error: { message?: string } | null }>;
  addPasskey(input: { name: string }): Promise<{ error: { message?: string } | null }>;
  enableTwoFactor(input: { password?: string; issuer: string }): Promise<{ error: { message?: string } | null; data: { method?: string; totpURI?: string; backupCodes?: string[] } | null }>;
  verifyTotpEnrollment(input: { code: string }): Promise<{ error: { message?: string } | null }>;
  verifyTwoFactorCode(input: { code: string }): Promise<boolean>;
  requestPasswordReset(input: { email: string }): Promise<boolean>;
  getNextAction(): Promise<LoginNextAction | null>;
  continueOAuthPostLogin(): Promise<string | null>;
};
export const redirectAfterLogin: (input: { gateway; dispatch; navigate }) => Promise<void>;
export const continueLoginAfterAuth: (input: { gateway; dispatch; navigate; offerPasskey: boolean; password: string | null; silentWhenUnauthenticated?: boolean }) => Promise<void>;
export const createLoginFlowActions: (input: { gateway; projectName; flow; dispatch; isSignup; navigate }) => LoginFlowActionsSurface;
```
Bodies are behavior-preserving ports of `useLoginFlowActions.ts` (submitCredentials, signInWithPasskey, startSocialSignIn, submitTwoFactor, submitForgotPassword, addPasskey, startTwoFactorEnrollment, verifyTwoFactorEnrollment). Unit tests build a `createGatewayFake(overrides)` plain-object fake and a harness that replays dispatched actions through `loginFlowReducer`, covering: rejected sign-in error, two-factor challenge step, verified-password recording, signup delegation/failure, silent unauthenticated continuation, enroll-2FA continuation with password, passkey offer honored only when enabled, failed OAuth continuation error.

Run: `cd apps/login && bun test src/hooks/loginFlowActions.test.ts` (fails on missing module first). Commit: `test: extract pure login flow actions behind a faked gateway`.

### Task 3: Cover recovery/enrollment/passkey actions; add the enrollment password fallback; rewire the hook
**Files:**
- Modify: `apps/login/src/hooks/loginFlowActions.ts` (fallback), `loginFlowActions.test.ts` (new cases), `apps/login/src/auth-client.ts` (add `createLoginFlowGateway`), `apps/login/src/hooks/useLoginFlowActions.ts` (thin binding via `useMemo`/`useCallback`, same external signature)

Key behavior change: `startTwoFactorEnrollment` uses `flow.verifiedPassword ?? (flow.password || null)` — the fallback Task 8's UI depends on. New unit cases: reset request → reset-sent step; enrollment stores TOTP setup; enrollment falls back to typed password; non-totp enrollment response errors; rejected 2FA code errors; addPasskey navigates on success / surfaces gateway message on failure; failed social start clears pending.

`createLoginFlowGateway({ authClient, config })` adapts the existing helpers (`signInWithEmail`, `signUpWithEmail`, `verifyTwoFactorCode`, `requestLoginPasswordReset` with `passwordResetUrl(config)`, `getLoginNextAction`, `continueOAuthPostLogin`) plus `authClient.signIn.passkey()`, `authClient.passkey.addPasskey`, `authClient.twoFactor.enable/verifyTotp`. On structural mismatches, write small explicit mappings — never `as` casts.

Run: `cd apps/login && bun test`, root `bun run typecheck`, `bun run test:browser` (5 mocked specs stay green). Commit: `test: cover recovery, enrollment, and passkey login actions; rewire hook onto the gateway`.

### Task 4: Real-stack browser harness + smoke spec
**Files:**
- Create: `apps/api/integration/browser-server.ts`, `tests/browser/support/harness.ts`, `tests/browser/real-stack.spec.ts`
- Modify: `playwright.config.ts` (third webServer: `bun apps/api/integration/browser-server.ts`, url `http://127.0.0.1:3000/readyz`), `apps/api/integration/seed.ts` (add `passkey` feature option), `apps/api/integration/setup.ts` (export shared `extractEmailUrl` + `decodeTotpSecret`; update `email-flows.integration.ts` and `reference-product.integration.ts` to import them)

**Harness design:**
- Boots real API via `createIntegrationApp({ publicBaseUrl: "http://127.0.0.1:5174", email: Resend config })`; the login Vite dev server on 5174 proxies `/api` → 3000, giving one origin for cookies + WebAuthn (`rpID = 127.0.0.1`).
- Resets the integration DB on boot; seeds realms `demo` (oauthProvider), `demo-2fa` (twoFactor required for everyone), `demo-passkey` (passkey enabled); registers per-realm OAuth clients (a skip-consent app client and, for `demo`, a consent client with redirect suffix `-consent`).
- Captures Resend sends by patching `globalThis.fetch` for `https://api.resend.com/emails` into an in-memory mailbox (same pattern as email-flows integration test).
- Test-only routes: `GET /__test__/context` (seeded client ids), `GET /__test__/emails?to=`, `GET /__test__/totp?secret=` (via `ProjectAuth.api.generateTOTP` + `decodeTotpSecret`), `POST /__test__/users` (sign-up + auto-verify via captured email).
- `tests/browser/support/harness.ts` exports: `LOGIN_ORIGIN`, `HARNESS_ORIGIN`, `DEMO_PASSWORD`, `readHarnessContext`, `uniqueEmail`, `seedVerifiedUser`, `buildAuthorizeUrl` (code+PKCE authorize URL with S256 challenge), `waitForEmail`, `extractEmailUrl`, `fetchTotpCode`.

Smoke spec: `GET authorize` → redirected to `/login/demo?` with `sig` + `ba_param` in query, heading "Continue to Demo App.", email/password fields visible.

Run: `bun run test:integration:up && bun run test:browser tests/browser/real-stack.spec.ts`, then full suite + `bun run test:integration` (helper extraction). Commit: `test: add real-stack browser harness for the hosted login`.

### Task 5: Email sign-in happy path (real stack)
Create `tests/browser/login-email-sign-in.spec.ts`: (1) seeded verified user completes authorize → login → callback with `code` + preserved `state` + `iss`; (2) wrong password shows "Invalid email or password" and stays on `/login/demo`. Commit: `test: real-stack browser coverage for hosted email sign-in`.

### Task 6: Sign-up + email verification (real stack)
Create `tests/browser/login-sign-up.spec.ts`: Create-account journey ("Create one →" link, "Create account ↗" button) sends "Verify your Demo App account" email; before verification sign-in is refused; after opening the emailed `/verify-email` link the OAuth journey completes. Commit: `test: real-stack browser coverage for sign-up and email verification`.

### Task 7: Password reset via emailed link (real stack)
Create `tests/browser/login-password-reset.spec.ts`: "Forgot?" → "Send reset link ↗" → neutral confirmation panel; open emailed `/reset-password/<token>` link → hosted reset page → new password → "Your password has been reset."; old password fails, new password completes the journey. Commit: `test: real-stack browser coverage for hosted password reset`.

### Task 8: TOTP 2FA enrollment + challenge (real stack, includes enroll-password UI fix)
**Product fix:** `TwoFactorEnrollStep` (apps/login/src/components/TwoFactorSteps.tsx) gains `requiresPassword/password/onPasswordChange` props and renders a password `FormField` before "Set up authenticator ↗" when no verified password exists (post-redirect state); `useLoginFlow` exposes `hasVerifiedPassword`; `LoginPage` wires `requiresPassword={!state.hasVerifiedPassword}`.

Spec `tests/browser/login-two-factor.spec.ts`: sign-in on `demo-2fa` → enroll step → enter password → read `otpauth://` URI from `<pre>` → fetch code from `/__test__/totp` → "Enable and continue ↗" → callback code; then `clearCookies()` → sign-in → TOTP challenge → verify → callback code. Commit: `feat: ask for the password on hosted 2FA enrollment and cover TOTP end to end`.

### Task 9: Passkey enrollment + sign-in via CDP virtual authenticator (real stack)
Create `tests/browser/login-passkey.spec.ts`. CDP setup: `WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator` (`ctap2`, `internal`, resident key, user verification, automatic presence). Journey: (1) email sign-in establishes a session; (2) fetch a fresh authorize redirect without cookies (anonymous request context, `maxRedirects: 0`), open the signed login URL with session cookies → passkey-enroll offer → "Add passkey" → callback code; (3) `clearCookies()` → "Sign in with passkey" → callback code. Commit: `test: real-stack passkey enrollment and sign-in via CDP virtual authenticator`.

### Task 10: OAuth consent approve and deny (real stack)
Create `tests/browser/login-oauth-consent.spec.ts` using the `demo` realm's consent client (`skipConsent: false`, redirect `/__callback/demo-consent`): approve → callback with `code`, no `error`; deny → callback with `error=access_denied`, no `code`. Final gate: `bun run test:integration:down && bun run test:integration:up && bun run test:browser && bun run typecheck && bun run test`. Commit: `test: real-stack browser coverage for OAuth consent approve and deny`.

### Critical Files for Implementation
- /Users/yuri/Sites/auth/apps/login/src/hooks/useLoginFlowActions.ts
- /Users/yuri/Sites/auth/apps/login/src/auth-client.ts
- /Users/yuri/Sites/auth/apps/api/integration/setup.ts
- /Users/yuri/Sites/auth/playwright.config.ts
- /Users/yuri/Sites/auth/apps/api/integration/browser-server.ts (new)
