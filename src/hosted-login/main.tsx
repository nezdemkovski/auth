import { createRoot } from "react-dom/client";

import "./style.css";

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
  const isSignup = config.mode === "signup";
  const title = isSignup ? "Create account" : "Log in";
  const subtitle = isSignup
    ? "Create a secure account for this project."
    : "Continue to your project workspace.";
  const alternateUrl = new URL(`/${config.project}/login`, window.location.origin);

  alternateUrl.searchParams.set("redirect_uri", config.redirectUri);
  alternateUrl.searchParams.set("state", config.state);
  alternateUrl.searchParams.set("mode", isSignup ? "login" : "signup");
  alternateUrl.searchParams.set("code_challenge", config.codeChallenge);
  alternateUrl.searchParams.set("code_challenge_method", "S256");

  document.title = `${title} - ${config.projectName}`;

  return (
    <section className="relative grid min-h-screen place-items-center px-5 py-8 sm:px-8">
      <div className="auth-shell relative z-10 w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-2 rounded-full border border-line/80 bg-panel/70 px-3 py-1.5 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_18px_rgba(110,231,168,.8)]" />
            Hosted auth
          </span>
          <span className="font-medium text-muted/80">{config.projectName}</span>
        </div>

        <form
          method="post"
          action={`/${config.project}/login`}
          className="relative overflow-hidden rounded-[28px] border border-line bg-panel/88 p-6 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-7"
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-accent/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-teal-400/10 blur-3xl" />

          <div className="relative">
            <div className="mb-7">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.28em] text-accent/80">
                {config.projectName}
              </p>
              <h1 className="text-4xl font-semibold tracking-[-.03em] text-ink sm:text-5xl">
                {title}
              </h1>
              <p className="mt-3 max-w-[22rem] text-sm leading-6 text-muted">
                {subtitle}
              </p>
            </div>

            {config.error ? (
              <div className="mb-5 rounded-2xl border border-red-400/25 bg-red-950/55 px-4 py-3 text-sm text-danger">
                {config.error}
              </div>
            ) : null}

            <input type="hidden" name="redirect_uri" value={config.redirectUri} />
            <input type="hidden" name="state" value={config.state} />
            <input type="hidden" name="mode" value={config.mode} />
            <input type="hidden" name="code_challenge" value={config.codeChallenge} />

            <label className="mb-2 block text-sm font-medium text-ink/80" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mb-5 h-13 w-full rounded-2xl border border-line bg-black/28 px-4 text-[16px] text-ink outline-none transition focus:border-accent/70 focus:bg-black/40 focus:shadow-[0_0_0_4px_rgba(110,231,168,.08)]"
            />

            <label className="mb-2 block text-sm font-medium text-ink/80" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              className="h-13 w-full rounded-2xl border border-line bg-black/28 px-4 text-[16px] text-ink outline-none transition focus:border-accent/70 focus:bg-black/40 focus:shadow-[0_0_0_4px_rgba(110,231,168,.08)]"
            />

            <button
              type="submit"
              className="mt-7 h-13 w-full rounded-2xl bg-accent-strong text-[15px] font-semibold text-emerald-950 shadow-[0_14px_38px_rgba(34,197,94,.24)] transition hover:-translate-y-0.5 hover:bg-accent hover:shadow-[0_18px_46px_rgba(34,197,94,.3)] active:translate-y-0"
            >
              {title}
            </button>

            <a
              href={alternateUrl.toString()}
              className="mt-5 block text-center text-sm font-medium text-accent/85 transition hover:text-accent"
            >
              {isSignup ? "Already have an account? Log in" : "Need an account? Sign up"}
            </a>
          </div>
        </form>

        <p className="mt-5 text-center text-[11px] leading-5 text-muted/65">
          Session handoff uses a short-lived code and returns to the requesting app.
        </p>
      </div>
    </section>
  );
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <LoginPage config={config} />
);
