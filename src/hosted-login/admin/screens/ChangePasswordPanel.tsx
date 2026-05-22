import { useState } from "react";

import { jsonHeaders, loadSession } from "../api";
import type { MeResponse, ViewState } from "../types";
import { FormAlert, FormField, PrimaryButton } from "../components/primitives";

export function ChangePasswordPanel({
  me,
  error,
  onDone
}: {
  me: MeResponse;
  error?: string;
  onDone: (next: ViewState) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setPending(false);
      onDone({ status: "force-change", me, error: "New passwords do not match" });
      return;
    }

    const response = await fetch("/admin/api/change-password", {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!response.ok) {
      setPending(false);
      onDone({
        status: "force-change",
        me,
        error:
          response.status === 400
            ? "Use a password with at least 12 characters"
            : "Could not change password"
      });
      return;
    }

    onDone(await loadSession());
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow">First login</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <h1 className="serif text-[48px] leading-[0.95] tracking-[-0.03em] text-ink">
        Set a new <em>password.</em>
      </h1>
      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        Signed in as{" "}
        <span className="mono text-[13px] text-ink-soft">{me.user.email}</span>.
        Change the temporary password before continuing.
      </p>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">
        <FormField
          id="current-password"
          name="currentPassword"
          label="Temporary password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <FormField
          id="new-password"
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 12 characters"
        />
        <FormField
          id="confirm-password"
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat new password"
        />
        <PrimaryButton type="submit" loading={pending}>
          {pending ? "Saving…" : "Save password ↗"}
        </PrimaryButton>
      </form>
    </div>
  );
}
