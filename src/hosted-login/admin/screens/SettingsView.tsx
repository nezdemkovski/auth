import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { changeAdminPassword, updateAdminProfile } from "../api";
import { PrimaryButton, SettingsInput } from "../components/primitives";
import { notifyError, notifySuccess } from "../toast";
import type { MeResponse } from "../types";

export function SettingsView({ me }: { me: MeResponse }) {
  return (
    <div className="space-y-12">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">Admin</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[56px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Settings<em>.</em>
        </h1>
        <p className="mt-3 max-w-[36rem] text-[14.5px] leading-[1.55] text-muted">
          Manage your admin account.
        </p>
      </div>

      <ProfileSection me={me} />
      <SecuritySection />
    </div>
  );
}

function ProfileSection({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const initialName = me.user.name ?? "";
  const initialEmail = me.user.email;
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");

  useEffect(() => {
    setName(initialName);
    setEmail(initialEmail);
    setCurrentPassword("");
  }, [initialName, initialEmail]);

  const mutation = useMutation({
    mutationFn: updateAdminProfile,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
      const changed = [
        variables.name !== undefined ? "name" : null,
        variables.email !== undefined ? "email" : null
      ]
        .filter(Boolean)
        .join(" and ");
      notifySuccess(
        "Profile updated",
        changed ? `Your ${changed} has been saved.` : undefined
      );
    },
    onError: (error) => {
      notifyError(
        "Could not save profile",
        error instanceof Error ? error.message : undefined
      );
    }
  });

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const dirty =
    trimmedName !== initialName.trim() ||
    trimmedEmail !== initialEmail.toLowerCase();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: { name?: string; email?: string; currentPassword?: string } = {};
    if (trimmedName !== initialName.trim()) patch.name = trimmedName;
    if (trimmedEmail !== initialEmail.toLowerCase()) {
      patch.email = trimmedEmail;
      patch.currentPassword = currentPassword;
    }
    mutation.mutate(patch);
  }

  const emailChanged = trimmedEmail !== initialEmail.toLowerCase();

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow">01 — Profile</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="max-w-[440px] space-y-4">
        <SettingsInput
          id="admin-name"
          label="Display name"
          value={name}
          onChange={setName}
          autoComplete="name"
          placeholder="Your name"
        />
        <SettingsInput
          id="admin-email"
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
        />
        {emailChanged ? (
          <SettingsInput
            id="admin-email-current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            type="password"
            autoComplete="current-password"
            placeholder="Required to change email"
          />
        ) : null}

        <PrimaryButton
          type="submit"
          loading={mutation.isPending}
          disabled={!dirty || (emailChanged && currentPassword.length === 0)}
        >
          {mutation.isPending ? "Saving…" : "Save changes →"}
        </PrimaryButton>
      </form>
    </section>
  );
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: changeAdminPassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notifySuccess(
        "Password updated",
        "Other sessions have been signed out."
      );
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

  function submit(event: React.FormEvent<HTMLFormElement>) {
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
  }

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

        <PrimaryButton
          type="submit"
          loading={mutation.isPending}
          disabled={!ready}
        >
          {mutation.isPending ? "Saving…" : "Change password →"}
        </PrimaryButton>
      </form>
    </section>
  );
}
