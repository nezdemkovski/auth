import type React from "react";
import { useEffect, useState } from "react";

import type {
  ProjectSettingsPatch,
  ProjectSummary,
  StorageObject,
  StorageSettings
} from "../../types";
import { projectToSettingsForm } from "../../utils/format";
import {
  Button,
  FormAlert,
  SelectField,
  SettingsInput,
  SettingsTextarea
} from "@nezdemkovski/auth-ui";
import { FeatureToggle } from "./FeatureToggle";
import { ProjectIconField } from "./ProjectIconField";
import {
  AGENT_ACCESS_MODE_OPTIONS,
  TWO_FACTOR_REQUIREMENT_OPTIONS,
  parseAgentAccessMode,
  parseTwoFactorRequirement
} from "./project-settings-options";

export function ProjectSettingsForm({
  project,
  storageSettings,
  pending,
  uploadPending,
  error,
  uploadError,
  uploadedIcon,
  onUploadIcon,
  onSubmit
}: {
  project: ProjectSummary;
  storageSettings: StorageSettings | null;
  pending: boolean;
  uploadPending: boolean;
  error: string | null;
  uploadError: string | null;
  uploadedIcon: StorageObject | null;
  onUploadIcon: (file: File) => void;
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
          dynamicClientRegistration: form.oauthDynamicClientRegistration
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
            These settings control the login experience, trusted origins,
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

      {localError || error || uploadError ? (
        <FormAlert>{localError ?? error ?? uploadError}</FormAlert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <SettingsInput
          id="project-name"
          label="Name"
          value={form.name}
          disabled={project.system}
          onChange={(value) => update("name", value)}
        />
        <ProjectIconField
          value={form.iconUrl}
          storageConfigured={Boolean(storageSettings?.configured)}
          disabled={project.system}
          uploadPending={uploadPending}
          uploadedIcon={uploadedIcon}
          onUrlChange={(value) => update("iconUrl", value)}
          onUpload={onUploadIcon}
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

          <SelectField
            label="Two-factor requirement"
            value={form.twoFactorRequired}
            disabled={project.system || !form.twoFactorEnabled}
            options={TWO_FACTOR_REQUIREMENT_OPTIONS}
            className="pl-8 md:max-w-[20rem]"
            onChange={(value) =>
              update("twoFactorRequired", parseTwoFactorRequirement(value))
            }
          />

          <FeatureToggle
            label="Agent Auth"
            description="Allow AI agents to request scoped access through the Agent Auth protocol."
            checked={form.agentAuthEnabled}
            disabled={project.system}
            onChange={(checked) => update("agentAuthEnabled", checked)}
          />

          <SelectField
            label="Agent access mode"
            value={form.agentAuthMode}
            disabled={project.system || !form.agentAuthEnabled}
            options={AGENT_ACCESS_MODE_OPTIONS}
            className="pl-8 md:max-w-[20rem]"
            onChange={(value) => update("agentAuthMode", parseAgentAccessMode(value))}
          />

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
        <Button
          type="submit"
          disabled={project.system || pending}
          loading={pending}
          variant="primary"
          size="sm"
          className="px-4"
        >
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
