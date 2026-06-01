import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PrimaryButton, SettingsInput } from "@nezdemkovski/auth-ui";

import { updateAdminProfile } from "../../api";
import { adminQueryKeys } from "../../queryKeys";
import { notifyError, notifySuccess } from "../../toast";
import type { MeResponse } from "../../types";

export function ProfileSection({ me }: { me: MeResponse }) {
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
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.me() });
      const changed = [
        variables.name !== undefined ? "name" : null,
        variables.email !== undefined ? "email change request" : null
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
  const emailDirty = trimmedEmail !== initialEmail.toLowerCase();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch: { name?: string; email?: string; currentPassword?: string } = {};
    if (trimmedName !== initialName.trim()) patch.name = trimmedName;
    if (emailDirty) {
      patch.email = trimmedEmail;
      patch.currentPassword = currentPassword;
    }
    mutation.mutate(patch);
  };

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
        {emailDirty ? (
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
          disabled={!dirty || (emailDirty && currentPassword.length === 0)}
        >
          {mutation.isPending ? "Saving…" : "Save changes →"}
        </PrimaryButton>
      </form>
    </section>
  );
}
