import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

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
  error?: string;
};

declare global {
  interface Window {
    __HOSTED_AUTH__?: HostedAuthConfig;
  }
}

const config = window.__HOSTED_AUTH__;

if (!config) {
  throw new Error("Hosted auth config is missing");
}

function LoginPage({ config }: { config: HostedAuthConfig }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const isSignup = config.mode === "signup";
  const title = isSignup ? "Create account" : "Welcome back";
  const subtitle = isSignup
    ? `Set up access to ${config.projectName}.`
    : `Continue to ${config.projectName}.`;
  const alternateUrl = new URL(`/${config.project}/login`, window.location.origin);

  alternateUrl.searchParams.set("redirect_uri", config.redirectUri);
  alternateUrl.searchParams.set("state", config.state);
  alternateUrl.searchParams.set("mode", isSignup ? "login" : "signup");
  alternateUrl.searchParams.set("code_challenge", config.codeChallenge);
  alternateUrl.searchParams.set("code_challenge_method", "S256");

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
          <div className="enter">
            <div className="mb-6 flex items-baseline gap-3">
              <span className="eyebrow shrink-0">
                {isSignup ? "Register" : "Sign in"}
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>

            <h1 className="serif text-[58px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[68px]">
              {isSignup ? (
                <>
                  Create <em>account.</em>
                </>
              ) : (
                <>
                  Welcome <em>back.</em>
                </>
              )}
            </h1>
            <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">
              {subtitle}
            </p>
          </div>

          {config.error ? (
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
              <span>{config.error}</span>
            </div>
          ) : null}

          <form
            method="post"
            action={`/${config.project}/login`}
            className="enter enter-1 mt-8 space-y-4"
          >
            <input type="hidden" name="redirect_uri" value={config.redirectUri} />
            <input type="hidden" name="state" value={config.state} />
            <input type="hidden" name="mode" value={config.mode} />
            <input
              type="hidden"
              name="code_challenge"
              value={config.codeChallenge}
            />

            <FormField
              id="email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <FormField
              id="password"
              name="password"
              label="Password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 12 characters" : "••••••••"}
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

            <button
              type="submit"
              data-press
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent text-[14px] font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{
                boxShadow: "var(--shadow-button)",
                transition: "background-color 140ms ease, transform 120ms"
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--accent-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--accent)")
              }
            >
              {isSignup ? "Create account ↗" : "Sign in ↗"}
            </button>
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
        </div>
      </section>
    </div>
  );
}

function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  hint
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
  hint?: React.ReactNode;
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

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <LoginPage config={config} />
);
