import { useState } from "react";

import { jsonHeaders, loadSession } from "../api";
import type { ViewState } from "../types";
import { FormAlert, FormField, PrimaryButton } from "../components/primitives";

export function SignInPanel({
  error,
  onDone
}: {
  error?: string;
  onDone: (next: ViewState) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const response = await fetch("/admin/api/auth/sign-in/email", {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      setPending(false);
      onDone({ status: "signed-out", error: "Invalid email or password" });
      return;
    }

    onDone(await loadSession());
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow">Admin</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink">
        Sign <em>in.</em>
      </h1>
      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        Access the admin control plane.
      </p>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">
        <FormField
          id="admin-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
        />
        <FormField
          id="admin-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <PrimaryButton type="submit" loading={pending}>
          {pending ? "Signing in…" : "Sign in ↗"}
        </PrimaryButton>
      </form>
    </div>
  );
}
