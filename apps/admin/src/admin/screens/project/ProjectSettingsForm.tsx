import type React from "react";
import { useEffect, useState } from "react";

import type { ProjectSettingsPatch, ProjectSummary } from "../../types";
import { projectToSettingsForm } from "../../utils/format";
import { FormAlert, SettingsInput, SettingsTextarea } from "@nezdemkovski/auth-ui";

export function ProjectSettingsForm({
  project,
  pending,
  error,
  onSubmit
}: {
  project: ProjectSummary;
  pending: boolean;
  error: string | null;
  onSubmit: (patch: ProjectSettingsPatch) => void;
}) {
  const [form, setForm] = useState(() => projectToSettingsForm(project));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(projectToSettingsForm(project));
    setLocalError(null);
  }, [project]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trustedOrigins = form.trustedOrigins
      .split("\n")
      .map((origin: string) => origin.trim())
      .filter(Boolean);

    if (form.name.trim().length === 0) {
      setLocalError("Name is required.");
      return;
    }

    setLocalError(null);
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      iconUrl: form.iconUrl.trim(),
      appUrl: form.appUrl.trim(),
      trustedOrigins,
      features: {
        passkey: {
          enabled: form.passkeyEnabled
        },
        twoFactor: {
          enabled: form.twoFactorEnabled,
          required: form.twoFactorRequired
        },
        agentAuth: {
          enabled: form.agentAuthEnabled,
          mode: form.agentAuthMode
        },
        oauthProvider: {
          enabled: form.oauthProviderEnabled,
          dynamicClientRegistration:
            form.oauthProviderEnabled && form.oauthDynamicClientRegistration
        }
      }
    });
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            App details
          </h2>
          <p className="mt-1 max-w-[34rem] text-[12.5px] leading-5 text-muted">
            These settings control the hosted login experience, trusted origins,
            and application metadata.
          </p>
        </div>
        {project.appUrl ? (
          <a
            href={project.appUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Open app ↗
          </a>
        ) : null}
      </div>

      {project.system ? (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[12.5px] leading-5 text-muted">
          System realm settings are read-only from this dashboard.
        </div>
      ) : null}

      {localError || error ? <FormAlert>{localError ?? error}</FormAlert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <SettingsInput
          id="project-name"
          label="Name"
          value={form.name}
          disabled={project.system}
          onChange={(value) => update("name", value)}
        />
        <SettingsInput
          id="project-icon"
          label="Icon URL"
          value={form.iconUrl}
          disabled={project.system}
          placeholder="https://app.domain.com/icon.png"
          onChange={(value) => update("iconUrl", value)}
        />
        <SettingsInput
          id="project-app-url"
          label="App URL"
          value={form.appUrl}
          disabled={project.system}
          placeholder="https://app.domain.com"
          onChange={(value) => update("appUrl", value)}
        />
        <SettingsTextarea
          id="project-origins"
          label="Trusted origins"
          value={form.trustedOrigins}
          disabled={project.system}
          placeholder="https://app.domain.com"
          rows={4}
          onChange={(value) => update("trustedOrigins", value)}
        />
      </div>

      <SettingsTextarea
        id="project-description"
        label="Description"
        value={form.description}
        disabled={project.system}
        placeholder="Internal description for this realm."
        rows={3}
        onChange={(value) => update("description", value)}
      />

      <section className="rounded-lg border border-border bg-surface-muted p-4">
        <div>
          <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
            Auth features
          </h3>
          <p className="mt-1 max-w-[34rem] text-[12px] leading-5 text-muted">
            Feature availability is enforced by the server for this realm.
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          <FeatureToggle
            label="Passkeys"
            description="Allow users to register and sign in with WebAuthn passkeys."
            checked={form.passkeyEnabled}
            disabled={project.system}
            onChange={(checked) => update("passkeyEnabled", checked)}
          />

          <FeatureToggle
            label="Two-factor authentication"
            description="Allow TOTP and backup-code based second factor flows."
            checked={form.twoFactorEnabled}
            disabled={project.system}
            onChange={(checked) => update("twoFactorEnabled", checked)}
          />

          <label className="grid gap-1.5 pl-8">
            <span className="text-[12.5px] font-medium text-ink-soft">
              Two-factor requirement
            </span>
            <select
              value={form.twoFactorRequired}
              disabled={project.system || !form.twoFactorEnabled}
              onChange={(event) =>
                update(
                  "twoFactorRequired",
                  event.currentTarget.value as typeof form.twoFactorRequired
                )
              }
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 md:max-w-[18rem]"
            >
              <option value="optional">Optional</option>
              <option value="admins">Required for admins</option>
              <option value="everyone">Required for everyone</option>
            </select>
          </label>

          <FeatureToggle
            label="Agent Auth"
            description="Allow AI agents to request scoped access through the Agent Auth protocol."
            checked={form.agentAuthEnabled}
            disabled={project.system}
            onChange={(checked) => update("agentAuthEnabled", checked)}
          />

          <label className="grid gap-1.5 pl-8">
            <span className="text-[12.5px] font-medium text-ink-soft">
              Agent access mode
            </span>
            <select
              value={form.agentAuthMode}
              disabled={project.system || !form.agentAuthEnabled}
              onChange={(event) =>
                update("agentAuthMode", event.currentTarget.value as typeof form.agentAuthMode)
              }
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 md:max-w-[18rem]"
            >
              <option value="read-only">Read-only</option>
              <option value="scoped-write">Scoped write</option>
            </select>
          </label>

          <FeatureToggle
            label="OAuth provider"
            description="Expose OAuth 2.1 and OpenID Connect endpoints for this realm."
            checked={form.oauthProviderEnabled}
            disabled={project.system}
            onChange={(checked) => update("oauthProviderEnabled", checked)}
          />

          <FeatureToggle
            label="Dynamic client registration"
            description="Allow compatible OAuth clients, including MCP clients, to register themselves and receive a client ID."
            checked={form.oauthDynamicClientRegistration}
            disabled={project.system || !form.oauthProviderEnabled}
            onChange={(checked) => update("oauthDynamicClientRegistration", checked)}
            inset
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          data-press
          disabled={project.system || pending}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-ink outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          style={{ boxShadow: "var(--shadow-button)" }}
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function FeatureToggle({
  label,
  description,
  checked,
  disabled,
  inset = false,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  inset?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3 ${
        inset ? "ml-8" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border bg-surface text-accent focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-muted">{description}</span>
      </span>
    </label>
  );
}
