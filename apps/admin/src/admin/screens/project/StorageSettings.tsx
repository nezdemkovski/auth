import { useEffect, useState } from "react";

import type { StorageSettings, StorageSettingsPatch } from "../../types";
import { Button, FormAlert, SettingsInput } from "@nezdemkovski/auth-ui";

export function StorageSettingsForm({
  settings,
  disabled,
  pending,
  error,
  onSave,
}: {
  settings: StorageSettings;
  disabled: boolean;
  pending: boolean;
  error: string | null;
  onSave: (patch: StorageSettingsPatch) => void;
}) {
  const [form, setForm] = useState(() => settingsToForm(settings));

  useEffect(() => {
    setForm(settingsToForm(settings));
  }, [settings]);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Media storage
          </h2>
          <p className="mt-1 max-w-xl text-[12.5px] leading-5 text-muted">
            Optional S3-compatible storage for realm images, user images, and
            future files.
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {settings.configured ? "Configured" : "Optional"}
        </span>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <input
          type="checkbox"
          checked={form.enabled}
          disabled={disabled}
          onChange={(event) => update("enabled", event.currentTarget.checked)}
          className="mt-1 h-4 w-4 rounded border-border bg-surface"
        />
        <span>
          <span className="block text-[13px] font-semibold text-ink">
            Enable S3-compatible storage
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-muted">
            Uploads remain disabled until storage is enabled and configured.
          </span>
        </span>
      </label>

      {settings.managed ? (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[12.5px] leading-5 text-muted">
          Storage backend is managed by deployment configuration. This realm can
          only enable or disable uploads.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <SettingsInput
            id="storage-endpoint"
            label="Endpoint"
            value={form.endpoint}
            disabled={disabled || !form.enabled}
            placeholder="https://s3.example.com"
            onChange={(value) => update("endpoint", value)}
          />
          <SettingsInput
            id="storage-region"
            label="Region"
            value={form.region}
            disabled={disabled || !form.enabled}
            placeholder="auto"
            onChange={(value) => update("region", value)}
          />
          <SettingsInput
            id="storage-bucket"
            label="Bucket"
            value={form.bucket}
            disabled={disabled || !form.enabled}
            placeholder="auth-public"
            onChange={(value) => update("bucket", value)}
          />
          <SettingsInput
            id="storage-public-base-url"
            label="Public base URL"
            value={form.publicBaseUrl}
            disabled={disabled || !form.enabled}
            placeholder="https://files.example.com"
            onChange={(value) => update("publicBaseUrl", value)}
          />
          <SettingsInput
            id="storage-access-key"
            label="Access key ID"
            value={form.accessKeyId}
            disabled={disabled || !form.enabled}
            placeholder={
              settings.accessKeyIdConfigured
                ? "Stored encrypted"
                : "Access key ID"
            }
            onChange={(value) => update("accessKeyId", value)}
          />
          <SettingsInput
            id="storage-secret-key"
            label="Secret access key"
            value={form.secretAccessKey}
            disabled={disabled || !form.enabled}
            placeholder={
              settings.secretAccessKeyConfigured
                ? "Stored encrypted"
                : "Secret access key"
            }
            type="password"
            onChange={(value) => update("secretAccessKey", value)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={disabled || pending}
          loading={pending}
          variant="primary"
          size="sm"
          className="px-4"
          onClick={() =>
            onSave({
              provider: form.enabled ? "s3" : "none",
              enabled: form.enabled,
              ...(settings.managed
                ? {}
                : {
                    endpoint: form.endpoint.trim(),
                    region: form.region.trim() || "auto",
                    bucket: form.bucket.trim(),
                    publicBaseUrl: form.publicBaseUrl.trim(),
                    ...(form.accessKeyId.trim()
                      ? { accessKeyId: form.accessKeyId.trim() }
                      : {}),
                    ...(form.secretAccessKey.trim()
                      ? { secretAccessKey: form.secretAccessKey.trim() }
                      : {}),
              }),
            })
          }
        >
          {pending ? "Saving..." : "Save storage"}
        </Button>
      </div>
    </div>
  );
}

function settingsToForm(settings: StorageSettings) {
  return {
    enabled: settings.enabled,
    endpoint: settings.endpoint,
    region: settings.region || "auto",
    bucket: settings.bucket,
    publicBaseUrl: settings.publicBaseUrl,
    accessKeyId: "",
    secretAccessKey: "",
  };
}
