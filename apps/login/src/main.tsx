import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";

import {
  createLoginAuthClient,
  createLoginSessionRedirect,
  getLoginNextAction,
  LoginNextAction,
  PkceChallengeMethod,
  getOAuthPublicClient,
  requestLoginPasswordReset,
  resetLoginPassword,
  type OAuthPublicClient,
  signInWithSocial,
  signInWithEmail,
  signUpWithEmail,
  submitOAuthConsent,
  verifyTwoFactorCode
} from "./auth-client";
import "@nezdemkovski/auth-client-shared/style.css";
import {
  AuthHeading,
  ActionButton,
  CredentialsStep,
  ErrorAlert,
  FormField,
  ForgotPasswordStep,
  InfoPanel,
  LoginFooter,
  PasskeyEnrollStep,
  RedirectingPanel,
  ThemeToggle,
  TwoFactorEnrollStep,
  TwoFactorStep
} from "./components";
import { Button } from "@nezdemkovski/auth-ui";
import { LoginConfigError, LoginConfigLoader } from "./config-loader";
import { fallbackScopeDescription, getSubtitle, getTitle } from "./copy";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "@nezdemkovski/auth-client-shared/theme";
import type {
  AuthStep,
  LoginConfig,
  LoginOAuthConsentConfig,
  LoginPasswordResetConfig,
  SocialProviderId
} from "./types";

const root = createRoot(document.querySelector<HTMLDivElement>("#app")!);

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: LoginConfigError
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$project",
  component: LoginRoute
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$project/reset-password",
  component: ResetPasswordRoute
});

const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$project/oauth/consent",
  component: OAuthConsentRoute
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  resetPasswordRoute,
  oauthConsentRoute
]);

const loginRouter = createRouter({
  routeTree,
  basepath: "/login"
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof loginRouter;
  }
}

root.render(<RouterProvider router={loginRouter} />);

function LoginRoute() {
  const { project } = loginRoute.useParams();
  return (
    <LoginConfigLoader project={project} configPath="login">
      {(config) =>
        config.page === "oauth-consent" || config.page === "reset-password" ? (
          <LoginConfigError />
        ) : (
          <LoginPage config={config} />
        )
      }
    </LoginConfigLoader>
  );
}

function ResetPasswordRoute() {
  const { project } = resetPasswordRoute.useParams();
  return (
    <LoginConfigLoader project={project} configPath="reset-password">
      {(config) =>
        config.page === "reset-password" ? (
          <PasswordResetPage config={config} />
        ) : (
          <LoginConfigError />
        )
      }
    </LoginConfigLoader>
  );
}

function OAuthConsentRoute() {
  const { project } = oauthConsentRoute.useParams();
  return (
    <LoginConfigLoader project={project} configPath="oauth-consent">
      {(config) =>
        config.page === "oauth-consent" ? (
          <OAuthConsentPage config={config} />
        ) : (
          <LoginConfigError />
        )
      }
    </LoginConfigLoader>
  );
}

function LoginPage({ config }: { config: LoginConfig }) {
  const authClient = useMemo(
    () => createLoginAuthClient(config.project),
    [config.project]
  );
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const [step, setStep] = useState<AuthStep>("credentials");
  const [error, setError] = useState<string | null>(config.error ?? null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(() =>
    authClient.getLastUsedLoginMethod()
  );
  const isSignup = config.mode === "signup";
  const passkeysEnabled = config.features.passkey.enabled;
  const socialProviders = config.socialProviders;
  const title = getTitle(step, isSignup);
  const subtitle = getSubtitle(step, isSignup, config.projectName);
  const alternateUrl = useMemo(() => {
    const url = new URL(`/login/${config.project}`, window.location.origin);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("state", config.state);
    url.searchParams.set("mode", isSignup ? "login" : "signup");
    url.searchParams.set("code_challenge", config.codeChallenge);
    url.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
    return url;
  }, [config, isSignup]);

  useEffect(() => {
    document.title = `${title} · ${config.projectName}`;
    applyTheme(theme);
  }, [theme, title, config.projectName]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  useEffect(() => {
    setLastLoginMethod(authClient.getLastUsedLoginMethod());
  }, [step]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      if (isSignup) {
        const created = await signUpWithEmail({
          project: config.project,
          email,
          password,
          callbackURL: new URL(config.redirectUri).origin
        });
        if (!created) {
          setError("Could not create account");
          return;
        }
        setVerifiedPassword(password);
      } else {
        const signedIn = await signInWithEmail({
          project: config.project,
          email,
          password
        });
        if (!signedIn.ok) {
          setError("Invalid email or password");
          return;
        }
        if (signedIn.twoFactorRedirect) {
          setStep("two-factor");
          return;
        }
        setVerifiedPassword(password);
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled, password });
    } finally {
      setPending(false);
    }
  }

  async function signInWithPasskey() {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        setError(result.error.message || "Could not sign in with passkey");
        return;
      }

      await continueAfterAuth({ offerPasskey: false, password: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in with passkey");
    } finally {
      setPending(false);
    }
  }

  async function startSocialSignIn(provider: SocialProviderId) {
    setPending(true);
    setError(null);

    const callbackURL = new URL(`/login/${config.project}`, window.location.origin);
    callbackURL.searchParams.set("redirect_uri", config.redirectUri);
    callbackURL.searchParams.set("state", config.state);
    callbackURL.searchParams.set("mode", config.mode);
    callbackURL.searchParams.set("code_challenge", config.codeChallenge);
    callbackURL.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
    callbackURL.searchParams.set("social", "1");

    try {
      const started = await signInWithSocial({
        project: config.project,
        provider,
        callbackURL: callbackURL.toString()
      });
      if (!started) {
        setPending(false);
        setError("Could not start social sign-in");
      }
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : "Could not start social sign-in");
    }
  }

  async function submitTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const verified = await verifyTwoFactorCode({
        project: config.project,
        code: twoFactorCode.trim()
      });

      if (!verified) {
        setError("Invalid verification code");
        return;
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled, password });
    } finally {
      setPending(false);
    }
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const resetUrl = new URL(
        `/login/${config.project}/reset-password`,
        window.location.origin
      );
      const sent = await requestLoginPasswordReset({
        project: config.project,
        email,
        redirectTo: resetUrl.toString()
      });
      if (!sent) {
        setError("Could not send reset email");
        return;
      }

      setStep("reset-sent");
    } finally {
      setPending(false);
    }
  }

  async function addPasskey() {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.passkey.addPasskey({
        name: `${config.projectName} passkey`
      });
      if (result.error) {
        setError(result.error.message || "Could not add passkey");
        return;
      }

      await redirectWithCurrentSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add passkey");
    } finally {
      setPending(false);
    }
  }

  async function startTwoFactorEnrollment() {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.enable({
        ...(verifiedPassword ? { password: verifiedPassword } : {}),
        issuer: config.projectName
      });
      if (result.error || !result.data?.totpURI) {
        setError(result.error?.message || "Could not start two-factor setup");
        return;
      }

      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start two-factor setup");
    } finally {
      setPending(false);
    }
  }

  async function verifyTwoFactorEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: twoFactorCode.trim(),
        trustDevice: true
      });
      if (result.error) {
        setError(result.error.message || "Invalid verification code");
        return;
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled, password: verifiedPassword });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid verification code");
    } finally {
      setPending(false);
    }
  }

  async function continueAfterAuth({
    offerPasskey,
    password
  }: {
    offerPasskey: boolean;
    password: string | null;
  }) {
    const nextAction = await getLoginNextAction(config.project);

    if (nextAction === LoginNextAction.EnrollTwoFactor) {
      setVerifiedPassword(password);
      setStep("two-factor-enroll");
      return;
    }

    if (offerPasskey && nextAction === LoginNextAction.OfferPasskey) {
      setStep("passkey-enroll");
      return;
    }

    await redirectWithCurrentSession();
  }

  async function redirectWithCurrentSession() {
    setStep("redirecting");
    const redirectTo = await createLoginSessionRedirect({
      project: config.project,
      redirectUri: config.redirectUri,
      state: config.state,
      codeChallenge: config.codeChallenge
    });

    if (!redirectTo) {
      setStep("credentials");
      setError("Could not finish sign-in");
      return;
    }

    window.location.assign(redirectTo);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("social") !== "1") {
      return;
    }

    void continueAfterAuth({ offerPasskey: passkeysEnabled, password: null });
  }, []);

  const projectInitial = config.projectName.trim().charAt(0).toUpperCase() || "·";

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />

      <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-2 text-ink">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-semibold tracking-[-0.02em] text-accent-ink"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            {projectInitial}
          </span>
          <span className="text-[13.5px] font-medium tracking-[-0.005em]">
            {config.projectName}
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[440px]">
          <AuthHeading step={step} isSignup={isSignup} subtitle={subtitle} />
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}

          {step === "credentials" ? (
            <CredentialsStep
              isSignup={isSignup}
              passkeysEnabled={passkeysEnabled}
              socialProviders={socialProviders}
              lastLoginMethod={lastLoginMethod}
              pending={pending}
              email={email}
              password={password}
              alternateUrl={alternateUrl}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onPasskeySignIn={() => void signInWithPasskey()}
              onSocialSignIn={(provider) => void startSocialSignIn(provider)}
              onForgotPassword={() => setStep("forgot-password")}
              onSubmit={(event) => void submitCredentials(event)}
            />
          ) : null}

          {step === "two-factor" ? (
            <TwoFactorStep
              pending={pending}
              code={twoFactorCode}
              onCodeChange={setTwoFactorCode}
              onBack={() => setStep("credentials")}
              onSubmit={(event) => void submitTwoFactor(event)}
            />
          ) : null}

          {step === "two-factor-enroll" ? (
            <TwoFactorEnrollStep
              pending={pending}
              totpUri={totpUri}
              backupCodes={backupCodes}
              code={twoFactorCode}
              onCodeChange={setTwoFactorCode}
              onStart={() => void startTwoFactorEnrollment()}
              onSubmit={(event) => void verifyTwoFactorEnrollment(event)}
            />
          ) : null}

          {step === "forgot-password" ? (
            <ForgotPasswordStep
              pending={pending}
              email={email}
              onEmailChange={setEmail}
              onBack={() => setStep("credentials")}
              onSubmit={(event) => void submitForgotPassword(event)}
            />
          ) : null}

          {step === "reset-sent" ? (
            <InfoPanel>
              If an account exists for that email, a reset link has been sent.
            </InfoPanel>
          ) : null}

          {step === "passkey-enroll" ? (
            <PasskeyEnrollStep
              pending={pending}
              onAdd={() => void addPasskey()}
              onSkip={() => void redirectWithCurrentSession()}
            />
          ) : null}

          {step === "redirecting" ? <RedirectingPanel /> : null}
          <LoginFooter />
        </div>
      </section>
    </div>
  );
}

function OAuthConsentPage({ config }: { config: LoginOAuthConsentConfig }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const [client, setClient] = useState<OAuthPublicClient | null>(null);
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectInitial = config.projectName.trim().charAt(0).toUpperCase() || "·";
  const clientName = client?.client_name?.trim() || config.clientId;
  const clientUri = client?.client_uri?.trim() || null;

  useEffect(() => {
    document.title = `Authorize ${clientName} · ${config.projectName}`;
    applyTheme(theme);
  }, [theme, clientName, config.projectName]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  useEffect(() => {
    void getOAuthPublicClient({
      project: config.project,
      clientId: config.clientId
    }).then(setClient);
  }, [config.project, config.clientId]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  async function decideConsent(accept: boolean) {
    setPending(accept ? "approve" : "deny");
    setError(null);

    try {
      const redirectTo = await submitOAuthConsent({
        project: config.project,
        accept,
        scopes: config.scopes,
        oauthQuery: config.oauthQuery
      });

      if (!redirectTo) {
        setError("Could not finish authorization");
        return;
      }

      window.location.assign(redirectTo);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />

      <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-2 text-ink">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-semibold tracking-[-0.02em] text-accent-ink"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            {projectInitial}
          </span>
          <span className="text-[13.5px] font-medium tracking-[-0.005em]">
            {config.projectName}
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[520px]">
          <div className="enter">
            <div className="mb-6 flex items-baseline gap-3">
              <span className="eyebrow shrink-0">OAuth</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>

            <h1 className="serif text-[58px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[68px]">
              Approve <em>access.</em>
            </h1>
            <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">
              {clientName} is requesting access through {config.projectName}.
            </p>
          </div>

          {error ? <ErrorAlert>{error}</ErrorAlert> : null}

          <div
            className="enter enter-1 mt-8 rounded-xl border border-border bg-surface p-4"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-start gap-3">
              {client?.logo_uri ? (
                <img
                  src={client.logo_uri}
                  alt=""
                  className="h-11 w-11 rounded-lg border border-border bg-surface-muted object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-[15px] font-semibold text-ink"
                >
                  {clientName.trim().charAt(0).toUpperCase() || "A"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {clientName}
                </h2>
                <p className="mt-1 break-all text-[12.5px] leading-5 text-muted">
                  {clientUri ?? config.clientId}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-medium text-ink-soft">
                  Requested permissions
                </span>
                <span className="tabular text-[11px] uppercase tracking-[0.08em] text-muted-soft">
                  {config.scopes.length} scopes
                </span>
              </div>

              {config.scopes.length > 0 ? (
                <ul className="space-y-2">
                  {config.scopes.map((scope) => {
                    const permission =
                      config.scopeDescriptions[scope] ?? fallbackScopeDescription(scope);
                    return (
                      <li
                        key={scope}
                        className="rounded-lg border border-border bg-surface-muted px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-ink">
                              {permission.title}
                            </p>
                            <p className="mt-0.5 text-[12px] leading-5 text-muted">
                              {permission.description}
                            </p>
                          </div>
                          <code className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted">
                            {scope}
                          </code>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[13px] text-muted">
                  No additional scopes were requested.
                </div>
              )}
            </div>
          </div>

          <div className="enter enter-2 mt-5 grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              disabled={pending !== null}
              onClick={() => void decideConsent(false)}
              loading={pending === "deny"}
              fullWidth
              className="h-11"
            >
              {pending === "deny" ? "Denying…" : "Deny"}
            </Button>
            <ActionButton
              type="button"
              disabled={pending !== null}
              className="h-11"
              onClick={() => void decideConsent(true)}
            >
              {pending === "approve" ? "Approving…" : "Approve access ↗"}
            </ActionButton>
          </div>

          <LoginFooter />
        </div>
      </section>
    </div>
  );
}

function PasswordResetPage({ config }: { config: LoginPasswordResetConfig }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    config.error ? "This reset link is invalid or expired." : null
  );
  const projectInitial = config.projectName.trim().charAt(0).toUpperCase() || "·";

  useEffect(() => {
    document.title = `Reset password · ${config.projectName}`;
    applyTheme(theme);
  }, [theme, config.projectName]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!config.token) {
      setError("This reset link is invalid or expired.");
      return;
    }
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const ok = await resetLoginPassword({
        project: config.project,
        token: config.token,
        newPassword: password
      });
      if (!ok) {
        setError("Could not reset password.");
        return;
      }
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  const returnUrl = config.appUrl || "/";

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />

      <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-2 text-ink">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-semibold tracking-[-0.02em] text-accent-ink"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            {projectInitial}
          </span>
          <span className="text-[13.5px] font-medium tracking-[-0.005em]">
            {config.projectName}
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[440px]">
          <div className="enter">
            <div className="mb-6 flex items-baseline gap-3">
              <span className="eyebrow shrink-0">Reset</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
            <h1 className="serif text-[58px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[68px]">
              New <em>password.</em>
            </h1>
            <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">
              Choose a new password for {config.projectName}.
            </p>
          </div>

          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          {done ? (
            <div className="enter enter-1 mt-8 space-y-4">
              <InfoPanel>Your password has been reset.</InfoPanel>
              <a
                href={returnUrl}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-3 text-[14px] font-medium text-accent-ink"
                style={{ boxShadow: "var(--shadow-button)" }}
              >
                Continue ↗
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="enter enter-1 mt-8 space-y-4">
              <FormField
                id="new-password"
                name="password"
                label="New password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 12 characters"
                value={password}
                onChange={setPassword}
              />
              <FormField
                id="confirm-password"
                name="confirm-password"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
              <ActionButton type="submit" disabled={pending || !config.token}>
                {pending ? "Saving…" : "Reset password ↗"}
              </ActionButton>
            </form>
          )}

          <LoginFooter />
        </div>
      </section>
    </div>
  );
}
