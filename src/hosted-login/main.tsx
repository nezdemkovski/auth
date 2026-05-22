import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createHostedAuthClient,
  createHostedSessionRedirect,
  signInWithSocial,
  signInWithEmail,
  signUpWithEmail,
  verifyTwoFactorCode
} from "./auth-client";
import {
  SiFacebook,
  SiGithub,
  SiGoogle,
  SiX
} from "@icons-pack/react-simple-icons";
import { MoonIcon, SunIcon } from "./icons";
import "./style.css";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "./theme";

type HostedAuthConfig = {
  project: string;
  projectName: string;
  redirectUri: string;
  state: string;
  mode: "login" | "signup";
  codeChallenge: string;
  features: ProjectFeatures;
  socialProviders: SocialProviderId[];
  error?: string;
};

type SocialProviderId = "github" | "google" | "twitter" | "facebook";

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

type AuthStep = "credentials" | "two-factor" | "passkey-enroll" | "redirecting";

declare global {
  interface Window {
    __HOSTED_AUTH__?: HostedAuthConfig;
  }
}

const config = window.__HOSTED_AUTH__;

if (!config) {
  throw new Error("Hosted auth config is missing");
}

const authClient = createHostedAuthClient(config.project);

function LoginPage({ config }: { config: HostedAuthConfig }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const [step, setStep] = useState<AuthStep>("credentials");
  const [error, setError] = useState<string | null>(config.error ?? null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const isSignup = config.mode === "signup";
  const passkeysEnabled = config.features.passkey.enabled;
  const twoFactorEnabled = config.features.twoFactor.enabled;
  const socialProviders = config.socialProviders;
  const title = getTitle(step, isSignup);
  const subtitle = getSubtitle(step, isSignup, config.projectName);
  const alternateUrl = useMemo(() => {
    const url = new URL(`/${config.project}/login`, window.location.origin);
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
      }

      await continueAfterAuth({ offerPasskey: passkeysEnabled });
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

      await continueAfterAuth({ offerPasskey: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in with passkey");
    } finally {
      setPending(false);
    }
  }

  async function startSocialSignIn(provider: SocialProviderId) {
    setPending(true);
    setError(null);

    const callbackURL = new URL(`/${config.project}/login`, window.location.origin);
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

      await continueAfterAuth({ offerPasskey: passkeysEnabled });
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

  async function continueAfterAuth({ offerPasskey }: { offerPasskey: boolean }) {
    if (offerPasskey) {
      setStep("passkey-enroll");
      return;
    }

    await redirectWithCurrentSession();
  }

  async function redirectWithCurrentSession() {
    setStep("redirecting");
    const redirectTo = await createHostedSessionRedirect({
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

    void redirectWithCurrentSession();
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
              pending={pending}
              email={email}
              password={password}
              alternateUrl={alternateUrl}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onPasskeySignIn={() => void signInWithPasskey()}
              onSocialSignIn={(provider) => void startSocialSignIn(provider)}
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

          {step === "passkey-enroll" ? (
            <PasskeyEnrollStep
              pending={pending}
              onAdd={() => void addPasskey()}
              onSkip={() => void redirectWithCurrentSession()}
            />
          ) : null}

          {step === "redirecting" ? <RedirectingPanel /> : null}
          <HostedFooter />
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
  pending,
  email,
  password,
  alternateUrl,
  onEmailChange,
  onPasswordChange,
  onPasskeySignIn,
  onSocialSignIn,
  onSubmit
}: {
  isSignup: boolean;
  passkeysEnabled: boolean;
  socialProviders: SocialProviderId[];
  pending: boolean;
  email: string;
  password: string;
  alternateUrl: URL;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasskeySignIn: () => void;
  onSocialSignIn: (provider: SocialProviderId) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasSocialProviders = socialProviders.length > 0;

  return (
    <>
      {(passkeysEnabled && !isSignup) || hasSocialProviders ? (
        <div className="enter enter-1 mt-8 space-y-3">
          {passkeysEnabled && !isSignup ? (
            <ActionButton type="button" disabled={pending} onClick={onPasskeySignIn}>
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

      <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
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
              <a
                href="#"
                className="text-[12px] font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Forgot?
              </a>
            ) : null
          }
        />

        <ActionButton type="submit" disabled={pending}>
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
    icon: SiGithub
  },
  google: {
    label: "Google",
    icon: SiGoogle
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
  onClick
}: {
  provider: SocialProviderId;
  disabled: boolean;
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
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface text-[14px] font-medium text-ink outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon size={16} />
      Continue with {meta.label}
    </button>
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
    <div className="enter enter-1 mt-8 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[13px] text-muted">
      Finishing sign-in…
    </div>
  );
}

function HostedFooter() {
  return (
    <footer className="enter enter-3 mono mt-12 text-center text-[10.5px] uppercase tracking-[0.08em] text-muted-soft sm:-mx-20 sm:whitespace-nowrap">
      ↳ Proudly hosted on homelab ·{" "}
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
  onClick,
  children
}: {
  type: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      data-press
      disabled={disabled}
      onClick={onClick}
      className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent text-[14px] font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
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
      {children}
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
        <MoonIcon size={15} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1)" : "scale(0.6)"
        }}
      >
        <SunIcon size={15} />
      </span>
    </button>
  );
}

function getTitle(step: AuthStep, isSignup: boolean): string {
  if (step === "two-factor") return "Verify code";
  if (step === "passkey-enroll") return "Add passkey";
  return isSignup ? "Create account" : "Welcome back";
}

function getSubtitle(step: AuthStep, isSignup: boolean, projectName: string): string {
  if (step === "two-factor") {
    return "Enter your authenticator code to finish signing in.";
  }
  if (step === "passkey-enroll") {
    return "Save a passkey for faster sign-ins on this device.";
  }
  return isSignup ? `Set up access to ${projectName}.` : `Continue to ${projectName}.`;
}

function getEyebrow(step: AuthStep, isSignup: boolean): string {
  if (step === "two-factor") return "Security";
  if (step === "passkey-enroll") return "Passkey";
  return isSignup ? "Register" : "Sign in";
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <LoginPage config={config} />
);
