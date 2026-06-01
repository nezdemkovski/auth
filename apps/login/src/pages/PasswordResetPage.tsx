import type { FormEvent } from "react";
import { useState } from "react";

import { resetLoginPassword } from "../auth-client";
import { LoginHeader } from "../components/LoginHeader";
import { LoginFooter } from "../components/LoginFooter";
import {
  ActionButton,
  ErrorAlert,
  FormField,
  InfoPanel
} from "../components/shared";
import { useLoginTheme } from "../hooks/useLoginTheme";
import type { LoginPasswordResetConfig } from "../types";

export function PasswordResetPage({ config }: { config: LoginPasswordResetConfig }) {
  const { theme, toggleTheme } = useLoginTheme("Reset password", config.projectName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    config.error ? "This reset link is invalid or expired." : null
  );

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

      <LoginHeader
        projectName={config.projectName}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

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
                className="shadow-button inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-3 text-[14px] font-medium text-accent-ink"
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
