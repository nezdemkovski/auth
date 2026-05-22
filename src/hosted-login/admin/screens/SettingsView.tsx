import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { changeAdminPassword, updateAdminProfile } from "../api";
import {
  FormAlert,
  PrimaryButton,
  SettingsInput
} from "../components/primitives";
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

  // Sync local state when me refetches with new server values
  useEffect(() => {
    setName(initialName);
    setEmail(initialEmail);
  }, [initialName, initialEmail]);

  const mutation = useMutation({
    mutationFn: updateAdminProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    }
  });

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const dirty =
    trimmedName !== initialName.trim() ||
    trimmedEmail !== initialEmail.toLowerCase();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: { name?: string; email?: string } = {};
    if (trimmedName !== initialName.trim()) patch.name = trimmedName;
    if (trimmedEmail !== initialEmail.toLowerCase()) patch.email = trimmedEmail;
    mutation.mutate(patch);
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof Error
      ? mutation.error.message
      : "Could not save profile"
    : null;

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

        {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}
        {mutation.isSuccess && !dirty ? (
          <p className="text-[12.5px]" style={{ color: "var(--success)" }}>
            Saved.
          </p>
        ) : null}

        <PrimaryButton
          type="submit"
          loading={mutation.isPending}
          disabled={!dirty}
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
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: changeAdminPassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  });

  const ready =
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    newPassword === confirmPassword;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMismatchError(null);

    if (newPassword !== confirmPassword) {
      setMismatchError("New passwords do not match");
      return;
    }
    if (newPassword.length < 12) {
      setMismatchError("Use a password with at least 12 characters");
      return;
    }

    mutation.mutate({ currentPassword, newPassword });
  }

  const errorMessage =
    mismatchError ??
    (mutation.isError
      ? mutation.error instanceof Error
        ? mutation.error.message
        : "Could not change password"
      : null);

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

        {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}
        {mutation.isSuccess ? (
          <p className="text-[12.5px]" style={{ color: "var(--success)" }}>
            Password updated.
          </p>
        ) : null}

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
