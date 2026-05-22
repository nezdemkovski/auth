import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { MoonIcon, ShieldIcon, SunIcon } from "./icons";
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
  const title = isSignup ? "Create your account" : "Welcome back";
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
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <section className="relative grid min-h-screen place-items-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="enter mb-7 flex items-center justify-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent text-[15px] font-semibold tracking-[-0.02em] text-accent-ink"
              style={{ boxShadow: "var(--shadow-button)" }}
            >
              {projectInitial}
            </span>
            <span className="text-[15px] font-medium tracking-[-0.005em] text-ink">
              {config.projectName}
            </span>
          </div>

          <div
            className="enter enter-1 overflow-hidden rounded-2xl border border-border bg-surface"
            style={{ boxShadow: "var(--shadow-elevated)" }}
          >
            <div className="px-8 pb-7 pt-8">
              <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
                {title}
              </h1>
              <p className="mt-1.5 text-[14px] leading-[1.45] text-muted">
                {subtitle}
              </p>

              {config.error ? (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-5"
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
                className="mt-6 space-y-3.5"
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
                  className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-[14px] font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                  {isSignup ? "Create account" : "Sign in"}
                </button>
              </form>
            </div>

            <div
              className="flex items-center justify-center gap-1 border-t border-border bg-surface-muted px-8 py-4 text-[13px]"
              style={{ color: "var(--muted)" }}
            >
              <span>{isSignup ? "Already have an account?" : "New to this project?"}</span>
              <a
                href={alternateUrl.toString()}
                className="font-medium text-ink underline-offset-[3px] transition-colors hover:underline"
              >
                {isSignup ? "Sign in" : "Create one"}
              </a>
            </div>
          </div>

          <div className="enter enter-2 mt-6 flex items-center justify-center gap-1.5 text-[12px] text-muted-soft">
            <ShieldIcon size={12} className="opacity-70" />
            <span>Short-lived authorization code · PKCE&nbsp;S256</span>
          </div>
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
        className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: theme === "dark" ? 1 : 0,
          transform: theme === "dark" ? "scale(1)" : "scale(0.5)",
          filter: theme === "dark" ? "blur(0)" : "blur(4px)"
        }}
      >
        <MoonIcon size={15} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1)" : "scale(0.5)",
          filter: theme === "light" ? "blur(0)" : "blur(4px)"
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
