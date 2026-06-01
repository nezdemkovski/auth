import { useEffect, useState } from "react";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "@nezdemkovski/auth-client-shared/theme";
import { Button } from "@nezdemkovski/auth-ui";

import {
  getOAuthPublicClient,
  submitOAuthConsent,
  type OAuthPublicClient
} from "../auth-client";
import {
  ActionButton,
  ErrorAlert,
  LoginFooter,
  ThemeToggle
} from "../components";
import { fallbackScopeDescription } from "../copy";
import type { LoginOAuthConsentConfig } from "../types";

export function OAuthConsentPage({ config }: { config: LoginOAuthConsentConfig }) {
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
