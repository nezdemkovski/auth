import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  changeAdminPassword,
  fetchDeliverySettings,
  fetchObservabilitySettings,
  sendObservabilityTestEvent,
  updateAdminProfile,
  updateDeliverySettings,
  updateObservabilitySettings,
  verifyDeliverySettings
} from "../api";
import {
  Button,
  PrimaryButton,
  SelectField,
  SettingsInput,
  Switch
} from "@nezdemkovski/auth-ui";
import { notifyError, notifySuccess } from "../toast";
import type {
  DeliveryProvider,
  DeliverySettings,
  DeliverySettingsPatch,
  MeResponse,
  ObservabilityProvider,
  ObservabilitySettings,
  ObservabilitySettingsPatch
} from "../types";

const DELIVERY_PROVIDER_OPTIONS = [
  { value: "none", label: "Disabled" },
  { value: "resend", label: "Resend" },
  { value: "cloudflare", label: "Cloudflare Email Routing" }
];

const OBSERVABILITY_PROVIDER_OPTIONS = [
  { value: "none", label: "Disabled" },
  { value: "sentry", label: "Sentry" }
];

const parseDeliveryProvider = (value: string) => {
  if (value === "resend" || value === "cloudflare") {
    return value;
  }
  return "none";
};

const parseObservabilityProvider = (value: string) => {
  if (value === "sentry") {
    return value;
  }
  return "none";
};

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
      <DeliverySection />
      <ObservabilitySection />
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

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: { name?: string; email?: string; currentPassword?: string } = {};
    if (trimmedName !== initialName.trim()) patch.name = trimmedName;
    if (emailDirty) {
      patch.email = trimmedEmail;
      patch.currentPassword = currentPassword;
    }
    mutation.mutate(patch);
  }

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

function DeliverySection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "delivery-settings"],
    queryFn: fetchDeliverySettings
  });
  const settings = query.data;
  const mutation = useMutation({
    mutationFn: updateDeliverySettings,
    onSuccess: async () => {
      notifySuccess("Delivery settings saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "delivery-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    },
    onError: (error) => {
      notifyError(
        "Could not save delivery settings",
        error instanceof Error ? error.message : undefined
      );
    }
  });
  const verifyMutation = useMutation({
    mutationFn: verifyDeliverySettings,
    onSuccess: () => notifySuccess("Test email sent"),
    onError: (error) => {
      notifyError(
        "Could not send test email",
        error instanceof Error ? error.message : undefined
      );
    }
  });

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow">03 — Delivery</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      {query.isError ? (
        <p className="text-[13px] text-danger">Could not load delivery settings.</p>
      ) : null}
      {settings ? (
        <DeliveryForm
          settings={settings}
          saving={mutation.isPending}
          verifying={verifyMutation.isPending}
          onSubmit={(patch) => mutation.mutate(patch)}
          onVerify={() => verifyMutation.mutate()}
        />
      ) : (
        <p className="text-[13px] text-muted">Loading delivery settings…</p>
      )}
    </section>
  );
}

function DeliveryForm({
  settings,
  saving,
  verifying,
  onSubmit,
  onVerify
}: {
  settings: DeliverySettings;
  saving: boolean;
  verifying: boolean;
  onSubmit: (patch: DeliverySettingsPatch) => void;
  onVerify: () => void;
}) {
  const [provider, setProvider] = useState<DeliveryProvider>(settings.provider);
  const [from, setFrom] = useState(settings.from);
  const [cloudflareAccountId, setCloudflareAccountId] = useState(
    settings.cloudflareAccountId
  );
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");

  useEffect(() => {
    setProvider(settings.provider);
    setFrom(settings.from);
    setCloudflareAccountId(settings.cloudflareAccountId);
    setCloudflareApiToken("");
    setResendApiKey("");
  }, [settings]);

  const dirty =
    provider !== settings.provider ||
    from.trim() !== settings.from ||
    cloudflareAccountId.trim() !== settings.cloudflareAccountId ||
    cloudflareApiToken.trim().length > 0 ||
    resendApiKey.trim().length > 0;
  const ready =
    provider === "none" ||
    (provider === "resend" &&
      from.trim().length > 0 &&
      (settings.resendApiKeyConfigured || resendApiKey.trim().length > 0)) ||
    (provider === "cloudflare" &&
      from.trim().length > 0 &&
      cloudflareAccountId.trim().length > 0 &&
      (settings.cloudflareApiTokenConfigured || cloudflareApiToken.trim().length > 0));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      provider,
      from,
      cloudflareAccountId,
      ...(cloudflareApiToken.trim() ? { cloudflareApiToken } : {}),
      ...(resendApiKey.trim() ? { resendApiKey } : {})
    });
  }

  return (
    <form onSubmit={submit} className="max-w-[560px] space-y-4">
      <SelectField
        label="Provider"
        value={provider}
        options={DELIVERY_PROVIDER_OPTIONS}
        onChange={(value) => setProvider(parseDeliveryProvider(value))}
      />

      {provider !== "none" ? (
        <SettingsInput
          id="delivery-from"
          label="From"
          value={from}
          onChange={setFrom}
          placeholder="Auth <auth@example.com>"
        />
      ) : null}

      {provider === "resend" ? (
        <SettingsInput
          id="delivery-resend-api-key"
          label={
            settings.resendApiKeyConfigured ? "Resend API key (configured)" : "Resend API key"
          }
          value={resendApiKey}
          onChange={setResendApiKey}
          type="password"
          autoComplete="off"
          placeholder={settings.resendApiKeyConfigured ? "Leave blank to keep current" : "re_..."}
        />
      ) : null}

      {provider === "cloudflare" ? (
        <>
          <SettingsInput
            id="delivery-cloudflare-account-id"
            label="Cloudflare account ID"
            value={cloudflareAccountId}
            onChange={setCloudflareAccountId}
            autoComplete="off"
            placeholder="Cloudflare account ID"
          />
          <SettingsInput
            id="delivery-cloudflare-api-token"
            label={
              settings.cloudflareApiTokenConfigured
                ? "Cloudflare API token (configured)"
                : "Cloudflare API token"
            }
            value={cloudflareApiToken}
            onChange={setCloudflareApiToken}
            type="password"
            autoComplete="off"
            placeholder={
              settings.cloudflareApiTokenConfigured
                ? "Leave blank to keep current"
                : "API token"
            }
          />
        </>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PrimaryButton type="submit" loading={saving} disabled={!dirty || !ready}>
          {saving ? "Saving…" : "Save delivery →"}
        </PrimaryButton>
        <Button
          type="button"
          onClick={onVerify}
          disabled={!settings.configured || verifying}
          loading={verifying}
          className="rounded-full px-5"
        >
          {verifying ? "Sending…" : "Send test email"}
        </Button>
      </div>
    </form>
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

function ObservabilitySection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "observability-settings"],
    queryFn: fetchObservabilitySettings
  });
  const settings = query.data;
  const mutation = useMutation({
    mutationFn: updateObservabilitySettings,
    onSuccess: async () => {
      notifySuccess("Observability settings saved");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "observability-settings"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "observability-config"]
      });
    },
    onError: (error) => {
      notifyError(
        "Could not save observability settings",
        error instanceof Error ? error.message : undefined
      );
    }
  });
  const testMutation = useMutation({
    mutationFn: sendObservabilityTestEvent,
    onSuccess: () => notifySuccess("Sentry test event sent"),
    onError: (error) => {
      notifyError(
        "Could not send test event",
        error instanceof Error ? error.message : undefined
      );
    }
  });

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow">04 — Observability</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      {query.isError ? (
        <p className="text-[13px] text-danger">
          Could not load observability settings.
        </p>
      ) : null}
      {settings ? (
        <ObservabilityForm
          settings={settings}
          saving={mutation.isPending}
          testing={testMutation.isPending}
          onSubmit={(patch) => mutation.mutate(patch)}
          onTest={() => testMutation.mutate()}
        />
      ) : (
        <p className="text-[13px] text-muted">Loading observability settings…</p>
      )}
    </section>
  );
}

function ObservabilityForm({
  settings,
  saving,
  testing,
  onSubmit,
  onTest
}: {
  settings: ObservabilitySettings;
  saving: boolean;
  testing: boolean;
  onSubmit: (patch: ObservabilitySettingsPatch) => void;
  onTest: () => void;
}) {
  const [provider, setProvider] = useState<ObservabilityProvider>(settings.provider);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [environment, setEnvironment] = useState(settings.environment);
  const [dsn, setDsn] = useState("");

  useEffect(() => {
    setProvider(settings.provider);
    setEnabled(settings.enabled);
    setEnvironment(settings.environment);
    setDsn("");
  }, [settings]);

  const dirty =
    provider !== settings.provider ||
    enabled !== settings.enabled ||
    environment.trim() !== settings.environment ||
    dsn.trim().length > 0;
  const ready =
    provider === "none" ||
    !enabled ||
    environment.trim().length > 0 &&
      (settings.dsnConfigured || dsn.trim().length > 0);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      provider,
      enabled,
      environment: environment.trim() || "production",
      ...(dsn.trim() ? { dsn: dsn.trim() } : {})
    });
  }

  return (
    <form onSubmit={submit} className="max-w-[560px] space-y-4">
      <SelectField
        label="Provider"
        value={provider}
        options={OBSERVABILITY_PROVIDER_OPTIONS}
        onChange={(value) => {
          const next = parseObservabilityProvider(value);
          setProvider(next);
          setEnabled(next === "sentry");
        }}
      />

      {provider === "sentry" ? (
        <>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3">
            <Switch checked={enabled} onChange={setEnabled} />
            <span>
              <span className="block text-[13px] font-semibold text-ink">
                Capture platform errors
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-muted">
                API, admin UI, and login UI events use one DSN with component and
                realm tags.
              </span>
            </span>
          </label>

          <SettingsInput
            id="observability-sentry-dsn"
            label={settings.dsnConfigured ? "Sentry DSN (configured)" : "Sentry DSN"}
            value={dsn}
            onChange={setDsn}
            type="password"
            autoComplete="off"
            placeholder={settings.dsnConfigured ? "Leave blank to keep current" : "https://..."}
          />
          <SettingsInput
            id="observability-environment"
            label="Environment"
            value={environment}
            onChange={setEnvironment}
            placeholder="production"
          />
        </>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PrimaryButton type="submit" loading={saving} disabled={!dirty || !ready}>
          {saving ? "Saving…" : "Save observability →"}
        </PrimaryButton>
        <Button
          type="button"
          onClick={onTest}
          disabled={!settings.configured || testing}
          loading={testing}
          className="rounded-full px-5"
        >
          {testing ? "Sending…" : "Send test event"}
        </Button>
      </div>
    </form>
  );
}
