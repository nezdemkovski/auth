import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { changeAdminPassword } from "../api";
import {
  FormAlert,
  FormField,
  PrimaryButton
} from "../components/primitives";
import type { MeResponse } from "../types";

export function ChangePasswordPanel({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: changeAdminPassword,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    }
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMismatchError(null);

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setMismatchError("New passwords do not match");
      return;
    }

    mutation.mutate({ currentPassword, newPassword });
  }

  const displayError =
    mismatchError ??
    (mutation.isError
      ? mutation.error instanceof Error
        ? mutation.error.message
        : "Could not change password"
      : null);

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

      {displayError ? <FormAlert>{displayError}</FormAlert> : null}

      <form onSubmit={submit} className="mt-8 space-y-4">
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
        <PrimaryButton type="submit" loading={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save password ↗"}
        </PrimaryButton>
      </form>
    </div>
  );
}
