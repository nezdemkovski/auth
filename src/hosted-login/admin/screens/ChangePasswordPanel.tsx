import { useMutation, useQueryClient } from "@tanstack/react-query";

import { changeAdminPassword } from "../api";
import { FormField, PrimaryButton } from "../components/primitives";
import { notifyError, notifySuccess } from "../toast";
import type { MeResponse } from "../types";

export function ChangePasswordPanel({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: changeAdminPassword,
    onSuccess: () => {
      notifySuccess("Password updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    },
    onError: (caught) => {
      notifyError(
        "Could not change password",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      notifyError("Passwords do not match");
      return;
    }
    if (newPassword.length < 12) {
      notifyError("Use a password with at least 12 characters");
      return;
    }

    mutation.mutate({ currentPassword, newPassword });
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
