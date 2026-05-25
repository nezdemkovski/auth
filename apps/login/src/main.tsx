import type { ComponentType, FormEvent, ReactNode } from "react";
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
  getLoginSession,
  getOAuthPublicClient,
  hasPasskeys,
  requestLoginPasswordReset,
  resetLoginPassword,
  type OAuthPublicClient,
  signInWithSocial,
  signInWithEmail,
  signUpWithEmail,
  submitOAuthConsent,
  verifyTwoFactorCode
} from "./auth-client";
import {
  SiFacebook,
  SiX
} from "@icons-pack/react-simple-icons";
import Github from "@lobehub/icons/es/Github";
import Google from "@lobehub/icons/es/Google";
import { Moon, Sun } from "lucide-react";
import "@nezdemkovski/auth-client-shared/style.css";
import { configureBrowserObservability } from "@nezdemkovski/auth-client-shared/observability";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "@nezdemkovski/auth-client-shared/theme";

type LoginConfig = {
  page?: "login";
  project: string;
  projectName: string;
  redirectUri: string;
  state: string;
  mode: "login" | "signup";
  codeChallenge: string;
  features: ProjectFeatures;
  socialProviders: SocialProviderId[];
  observability: PublicObservabilityConfig;
  error?: string;
};

type LoginOAuthConsentConfig = {
  page: "oauth-consent";
  project: string;
  projectName: string;
  clientId: string;
  scopes: string[];
  oauthQuery: string;
  observability: PublicObservabilityConfig;
};

type LoginPasswordResetConfig = {
  page: "reset-password";
  project: string;
  projectName: string;
  appUrl: string;
  token: string;
  observability: PublicObservabilityConfig;
  error?: string;
};

type LoginAuthConfig =
  | LoginConfig
  | LoginOAuthConsentConfig
  | LoginPasswordResetConfig;

type SocialProviderId = "github" | "google" | "twitter" | "facebook";

type PublicObservabilityConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
};

type ProjectFeatures = {
  passkey: {
    enabled: boolean;
  };
  twoFactor: {
    enabled: boolean;
    required: "optional" | "admins" | "everyone";
  };
  agentAuth: {
    enabled: boolean;
    mode: "read-only" | "scoped-write";
  };
};

type AuthStep =
  | "credentials"
  | "forgot-password"
  | "reset-sent"
  | "two-factor"
  | "two-factor-enroll"
  | "passkey-enroll"
  | "redirecting";

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

function LoginConfigLoader({
  project,
  configPath,
  children
}: {
  project: string;
  configPath: "login" | "reset-password" | "oauth-consent";
  children: (config: LoginAuthConfig) => ReactNode;
}) {
  const [config, setConfig] = useState<LoginAuthConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadLoginAuthConfig(project, configPath).then((loadedConfig) => {
      if (cancelled) {
        return;
      }

      if (!loadedConfig) {
        setFailed(true);
        return;
      }

      configureBrowserObservability({
        ...loadedConfig.observability,
        component: "login",
        projectSlug: loadedConfig.project
      });
      setConfig(loadedConfig);
      setFailed(false);
    });

    return () => {
      cancelled = true;
    };
  }, [project, configPath]);

  if (failed) {
    return <LoginConfigError />;
  }

  if (!config) {
    return null;
  }

  return <>{children(config)}</>;
}

async function loadLoginAuthConfig(
  project: string,
  configPath: "login" | "reset-password" | "oauth-consent"
): Promise<LoginAuthConfig | null> {
  const url = new URL(
    `/api/${project}/login/config/${configPath}`,
    window.location.origin
  );
  url.search = window.location.search;

  const response = await fetch(url, {
    credentials: "include"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LoginAuthConfig;
}

function LoginConfigError() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />
      <header className="relative z-10 flex h-14 items-center justify-end px-6 lg:px-10">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[440px]">
          <AuthHeading
            step="credentials"
            isSignup={false}
            subtitle="This auth page is missing the required runtime configuration."
          />
          <ErrorAlert>Cannot start.</ErrorAlert>
        </div>
      </section>
    </div>
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
  const twoFactorEnabled = config.features.twoFactor.enabled;
  const socialProviders = config.socialProviders;
  const title = getTitle(step, isSignup);
  const subtitle = getSubtitle(step, isSignup, config.projectName);
  const alternateUrl = useMemo(() => {
    const url = new URL(`/login/${config.project}`, window.location.origin);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("state", config.state);
    url.searchParams.set("mode", isSignup ? "login" : "signup");
    url.searchParams.set("code_challenge", config.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
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
        if (twoFactorEnabled && signedIn.twoFactorRedirect) {
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
    callbackURL.searchParams.set("code_challenge_method", "S256");
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
    const session = await getLoginSession(config.project);
    if (mustEnrollTwoFactor(config.features.twoFactor, session?.user)) {
      setVerifiedPassword(password);
      setStep("two-factor-enroll");
      return;
    }

    if (offerPasskey) {
      const alreadyEnrolled = await hasPasskeys(config.project);
      if (alreadyEnrolled) {
        await redirectWithCurrentSession();
        return;
      }

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
                    const permission = describeScope(scope);
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
            <button
              type="button"
              data-press
              disabled={pending !== null}
              onClick={() => void decideConsent(false)}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-surface px-3 text-[14px] font-medium text-ink outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "deny" ? "Denying…" : "Deny"}
            </button>
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

function AuthHeading({
  step,
  isSignup,
  subtitle
}: {
  step: AuthStep;
  isSignup: boolean;
  subtitle: string;
}) {
  return (
    <div className="enter">
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow shrink-0">{getEyebrow(step, isSignup)}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      <h1 className="serif text-[58px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[68px]">
        {step === "two-factor" ? (
          <>
            Verify <em>code.</em>
          </>
        ) : step === "two-factor-enroll" ? (
          <>
            Secure <em>account.</em>
          </>
        ) : step === "forgot-password" ? (
          <>
            Reset <em>password.</em>
          </>
        ) : step === "reset-sent" ? (
          <>
            Check <em>email.</em>
          </>
        ) : step === "passkey-enroll" ? (
          <>
            Add <em>passkey.</em>
          </>
        ) : isSignup ? (
          <>
            Create <em>account.</em>
          </>
        ) : (
          <>
            Welcome <em>back.</em>
          </>
        )}
      </h1>
      <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">{subtitle}</p>
    </div>
  );
}

function CredentialsStep({
  isSignup,
  passkeysEnabled,
  socialProviders,
  lastLoginMethod,
  pending,
  email,
  password,
  alternateUrl,
  onEmailChange,
  onPasswordChange,
  onPasskeySignIn,
  onSocialSignIn,
  onForgotPassword,
  onSubmit
}: {
  isSignup: boolean;
  passkeysEnabled: boolean;
  socialProviders: SocialProviderId[];
  lastLoginMethod: string | null;
  pending: boolean;
  email: string;
  password: string;
  alternateUrl: URL;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasskeySignIn: () => void;
  onSocialSignIn: (provider: SocialProviderId) => void;
  onForgotPassword: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasSocialProviders = socialProviders.length > 0;
  const showLastUsed = !isSignup && Boolean(lastLoginMethod);

  return (
    <>
      {showLastUsed ? (
        <div className="enter enter-1 mt-6 rounded-lg border border-border bg-surface-muted px-3 py-2 text-[12.5px] leading-5 text-muted">
          Last signed in with{" "}
          <span className="font-medium text-ink">
            {loginMethodLabel(lastLoginMethod)}
          </span>
          .
        </div>
      ) : null}

      {(passkeysEnabled && !isSignup) || hasSocialProviders ? (
        <div className={`enter enter-1 ${showLastUsed ? "mt-4" : "mt-8"} space-y-3`}>
          {passkeysEnabled && !isSignup ? (
            <ActionButton
              type="button"
              disabled={pending}
              onClick={onPasskeySignIn}
              badge={lastLoginMethod === "passkey" ? <LastUsedBadge contrast /> : undefined}
            >
              {pending ? "Waiting…" : "Sign in with passkey"}
            </ActionButton>
          ) : null}
          {hasSocialProviders ? (
            <div className="grid gap-2">
              {socialProviders.map((provider) => (
                <SocialButton
                  key={provider}
                  provider={provider}
                  disabled={pending}
                  lastUsed={lastLoginMethod === provider}
                  onClick={() => onSocialSignIn(provider)}
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-muted-soft">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.08em]">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className={`enter enter-1 ${
          (passkeysEnabled && !isSignup) || hasSocialProviders || showLastUsed
            ? "mt-4"
            : "mt-8"
        } space-y-4`}
      >
        <FormField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={onEmailChange}
        />
        <FormField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "At least 12 characters" : "••••••••"}
          value={password}
          onChange={onPasswordChange}
          hint={
            !isSignup ? (
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-[12px] font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Forgot?
              </button>
            ) : null
          }
        />

        <ActionButton
          type="submit"
          disabled={pending}
          badge={
            lastLoginMethod === "email" && !isSignup ? (
              <LastUsedBadge contrast />
            ) : undefined
          }
        >
          {pending ? "Working…" : isSignup ? "Create account ↗" : "Sign in ↗"}
        </ActionButton>
      </form>

      <div className="enter enter-2 mt-8">
        <hr className="rule" />
        <div className="mt-4 flex items-center justify-between gap-4 text-[13px]">
          <span className="text-muted">
            {isSignup ? "Already have an account?" : "No account yet?"}
          </span>
          <a
            href={alternateUrl.toString()}
            className="font-medium text-ink underline-offset-[3px] transition-colors hover:underline"
          >
            {isSignup ? "Sign in →" : "Create one →"}
          </a>
        </div>
      </div>
    </>
  );
}

const socialProviderMeta: Record<
  SocialProviderId,
  {
    label: string;
    icon: ComponentType<{ size?: number }>;
  }
> = {
  github: {
    label: "GitHub",
    icon: Github
  },
  google: {
    label: "Google",
    icon: Google
  },
  twitter: {
    label: "X",
    icon: SiX
  },
  facebook: {
    label: "Facebook",
    icon: SiFacebook
  }
};

function SocialButton({
  provider,
  disabled,
  lastUsed,
  onClick
}: {
  provider: SocialProviderId;
  disabled: boolean;
  lastUsed: boolean;
  onClick: () => void;
}) {
  const meta = socialProviderMeta[provider];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      data-press
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-[14px] font-medium text-ink outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon size={16} />
      <span className="min-w-0 flex-1 text-center">Continue with {meta.label}</span>
      {lastUsed ? <LastUsedBadge /> : null}
    </button>
  );
}

function LastUsedBadge({ contrast = false }: { contrast?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${
        contrast
          ? "border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.18)] text-accent-ink"
          : "border-border bg-surface-muted text-muted"
      }`}
    >
      Last used
    </span>
  );
}

function TwoFactorStep({
  pending,
  code,
  onCodeChange,
  onBack,
  onSubmit
}: {
  pending: boolean;
  code: string;
  onCodeChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <FormField
        id="two-factor-code"
        name="code"
        label="Verification code"
        type="text"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={onCodeChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify and continue ↗"}
      </ActionButton>
      <button
        type="button"
        disabled={pending}
        onClick={onBack}
        className="w-full text-center text-[13px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:opacity-60"
      >
        Back to password sign-in
      </button>
    </form>
  );
}

function TwoFactorEnrollStep({
  pending,
  totpUri,
  backupCodes,
  code,
  onCodeChange,
  onStart,
  onSubmit
}: {
  pending: boolean;
  totpUri: string;
  backupCodes: string[];
  code: string;
  onCodeChange: (value: string) => void;
  onStart: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!totpUri) {
    return (
      <div className="enter enter-1 mt-8 space-y-3">
        <InfoPanel>
          This realm requires two-factor authentication. Set up an authenticator
          app to continue.
        </InfoPanel>
        <ActionButton type="button" disabled={pending} onClick={onStart}>
          {pending ? "Preparing…" : "Set up authenticator ↗"}
        </ActionButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <p className="text-[12.5px] leading-5 text-muted">
          Add this setup key in your authenticator app, then enter the code it
          generates.
        </p>
        <textarea
          readOnly
          value={totpUri}
          rows={4}
          className="mt-3 w-full resize-none rounded-lg border border-border bg-surface p-2 font-mono text-[11px] leading-5 text-ink outline-none"
        />
      </div>

      {backupCodes.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-[12.5px] leading-5 text-muted">
            Save these backup codes before continuing.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-ink">
            {backupCodes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
        </div>
      ) : null}

      <FormField
        id="two-factor-enroll-code"
        name="code"
        label="Verification code"
        type="text"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={onCodeChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Enable and continue ↗"}
      </ActionButton>
    </form>
  );
}

function ForgotPasswordStep({
  pending,
  email,
  onEmailChange,
  onBack,
  onSubmit
}: {
  pending: boolean;
  email: string;
  onEmailChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <FormField
        id="reset-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={onEmailChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link ↗"}
      </ActionButton>
      <button
        type="button"
        disabled={pending}
        onClick={onBack}
        className="w-full text-center text-[13px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:opacity-60"
      >
        Back to sign in
      </button>
    </form>
  );
}

function PasskeyEnrollStep({
  pending,
  onAdd,
  onSkip
}: {
  pending: boolean;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="enter enter-1 mt-8 space-y-3">
      <ActionButton type="button" disabled={pending} onClick={onAdd}>
        {pending ? "Waiting…" : "Add passkey"}
      </ActionButton>
      <button
        type="button"
        disabled={pending}
        onClick={onSkip}
        className="w-full text-center text-[13px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:opacity-60"
      >
        Continue without passkey
      </button>
    </div>
  );
}

function RedirectingPanel() {
  return (
    <InfoPanel>Finishing sign-in…</InfoPanel>
  );
}

function InfoPanel({ children }: { children: ReactNode }) {
  return (
    <div className="enter enter-1 mt-8 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[13px] leading-5 text-muted">
      {children}
    </div>
  );
}

function LoginFooter() {
  return (
    <footer className="enter enter-3 mono mt-12 text-center text-[10.5px] uppercase tracking-[0.08em] text-muted-soft sm:-mx-20 sm:whitespace-nowrap">
      ↳ Running on homelab ·{" "}
      <a
        href="https://github.com/nezdemkovski/auth"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-[3px] transition-colors hover:text-ink hover:underline"
      >
        Open source on github ↗
      </a>
      {" · Built on "}
      <a
        href="https://better-auth.com"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-[3px] transition-colors hover:text-ink hover:underline"
      >
        better-auth ↗
      </a>
    </footer>
  );
}

function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="enter enter-1 mt-6 flex items-start gap-2 rounded-md border px-3 py-2.5 text-[13px] leading-5"
      style={{
        background: "var(--danger-bg)",
        borderColor: "var(--danger-border)",
        color: "var(--danger)"
      }}
    >
      <span
        aria-hidden="true"
        className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--danger)" }}
      />
      <span>{children}</span>
    </div>
  );
}

function ActionButton({
  type,
  disabled,
  badge,
  className,
  onClick,
  children
}: {
  type: "button" | "submit";
  disabled?: boolean;
  badge?: ReactNode;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      data-press
      disabled={disabled}
      onClick={onClick}
      className={`${className ?? "mt-2 h-11"} inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-[14px] font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60`}
      style={{
        boxShadow: "var(--shadow-button)",
        transition: "background-color 140ms ease, transform 120ms"
      }}
      onMouseEnter={(e) => {
        if (!e.currentTarget.disabled) {
          e.currentTarget.style.background = "var(--accent-hover)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--accent)";
      }}
    >
      <span className="min-w-0 flex-1 text-center">{children}</span>
      {badge}
    </button>
  );
}

function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  hint
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft"
        >
          {label}
        </label>
        {hint}
      </div>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        required
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft"
        style={{
          transition:
            "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease"
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--border-strong)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}

function ThemeToggle({
  theme,
  onToggle
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      data-press
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200"
        style={{
          opacity: theme === "dark" ? 1 : 0,
          transform: theme === "dark" ? "scale(1)" : "scale(0.6)"
        }}
      >
        <Moon size={15} strokeWidth={1.8} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1)" : "scale(0.6)"
        }}
      >
        <Sun size={15} strokeWidth={1.8} />
      </span>
    </button>
  );
}

function getTitle(step: AuthStep, isSignup: boolean): string {
  if (step === "two-factor") return "Verify code";
  if (step === "two-factor-enroll") return "Set up two-factor";
  if (step === "forgot-password") return "Reset password";
  if (step === "reset-sent") return "Check your email";
  if (step === "passkey-enroll") return "Add passkey";
  return isSignup ? "Create account" : "Welcome back";
}

function getSubtitle(step: AuthStep, isSignup: boolean, projectName: string): string {
  if (step === "two-factor") {
    return "Enter your authenticator code to finish signing in.";
  }
  if (step === "two-factor-enroll") {
    return "Set up an authenticator app before continuing.";
  }
  if (step === "forgot-password") {
    return "Send a password reset link to your email.";
  }
  if (step === "reset-sent") {
    return "Check your inbox for the next step.";
  }
  if (step === "passkey-enroll") {
    return "Save a passkey for faster sign-ins on this device.";
  }
  return isSignup ? `Set up access to ${projectName}.` : `Continue to ${projectName}.`;
}

function getEyebrow(step: AuthStep, isSignup: boolean): string {
  if (step === "two-factor") return "Security";
  if (step === "two-factor-enroll") return "Security";
  if (step === "forgot-password" || step === "reset-sent") return "Reset";
  if (step === "passkey-enroll") return "Passkey";
  return isSignup ? "Register" : "Sign in";
}

function loginMethodLabel(method: string | null): string {
  if (!method) return "your previous method";
  if (method === "email") return "email and password";
  if (method === "passkey") return "passkey";
  if (method in socialProviderMeta) {
    return socialProviderMeta[method as SocialProviderId].label;
  }

  return method;
}

function mustEnrollTwoFactor(
  policy: ProjectFeatures["twoFactor"],
  user: { role?: string | null; twoFactorEnabled?: boolean } | undefined
): boolean {
  if (!policy.enabled || policy.required === "optional" || user?.twoFactorEnabled) {
    return false;
  }

  if (policy.required === "everyone") {
    return true;
  }

  return policy.required === "admins" && user?.role === "admin";
}

function describeScope(scope: string): { title: string; description: string } {
  const normalized = scope.toLowerCase();
  const known: Record<string, { title: string; description: string }> = {
    openid: {
      title: "Sign you in",
      description: "Issue an OpenID identity token for this application."
    },
    profile: {
      title: "Read profile",
      description: "Access your basic profile details, such as name and avatar."
    },
    email: {
      title: "Read email",
      description: "Access your email address and verification status."
    },
    offline_access: {
      title: "Keep access",
      description: "Issue a refresh token so the application can stay connected."
    },
    "realm.info": {
      title: "Read realm information",
      description: "Access public metadata about this authentication realm."
    }
  };

  return (
    known[normalized] ?? {
      title: scope
        .split(/[.:_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      description: "Access this OAuth permission scope."
    }
  );
}
