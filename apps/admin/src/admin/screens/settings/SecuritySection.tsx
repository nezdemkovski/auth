import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { PrimaryButton, SettingsInput } from "@nezdemkovski/auth-ui";

import { changeAdminPassword } from "../../api";
import { notifyError, notifySuccess } from "../../toast";

export function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: changeAdminPassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notifySuccess("Password updated", "Other sessions have been signed out.");
    },
    onError: (error) => {
      notifyError(
        "Could not change password",
        error instanceof Error ? error.message : undefined
      );
    }
  });

  const ready =
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    newPassword === confirmPassword;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      notifyError("Passwords do not match");
      return;
    }
    if (newPassword.length < 12) {
      notifyError("Use a password with at least 12 characters");
      return;
    }

    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow">02 — Security</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="max-w-[440px] space-y-4">
        <SettingsInput
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <SettingsInput
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          type="password"
          autoComplete="new-password"
          placeholder="At least 12 characters"
        />
        <SettingsInput
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          type="password"
          autoComplete="new-password"
          placeholder="Repeat new password"
        />

        <PrimaryButton type="submit" loading={mutation.isPending} disabled={!ready}>
          {mutation.isPending ? "Saving…" : "Change password →"}
        </PrimaryButton>
      </form>
    </section>
  );
}
