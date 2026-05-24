import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, File as FileIcon, Folder, Image } from "lucide-react";

import type { StorageObject, StorageSettings, StorageSettingsPatch } from "../../types";
import { FormAlert, SettingsInput } from "@nezdemkovski/auth-ui";

export function StorageSettingsForm({
  settings,
  objects,
  objectsLoading,
  objectsError,
  disabled,
  pending,
  uploadPending,
  error,
  onSave,
  onUploadIcon
}: {
  settings: StorageSettings;
  objects: StorageObject[];
  objectsLoading: boolean;
  objectsError: string | null;
  disabled: boolean;
  pending: boolean;
  uploadPending: boolean;
  error: string | null;
  onSave: (patch: StorageSettingsPatch) => void;
  onUploadIcon: (file: File) => void;
}) {
  const [form, setForm] = useState(() => settingsToForm(settings));

  useEffect(() => {
    setForm(settingsToForm(settings));
  }, [settings]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Media storage
          </h2>
          <p className="mt-1 max-w-[36rem] text-[12.5px] leading-5 text-muted">
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
            Uploads remain disabled until endpoint, bucket, public URL, and
            credentials are saved.
          </span>
        </span>
      </label>

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
          placeholder={settings.accessKeyIdConfigured ? "Stored encrypted" : "Access key ID"}
          onChange={(value) => update("accessKeyId", value)}
        />
        <SettingsInput
          id="storage-secret-key"
          label="Secret access key"
          value={form.secretAccessKey}
          disabled={disabled || !form.enabled}
          placeholder={settings.secretAccessKeyConfigured ? "Stored encrypted" : "Secret access key"}
          type="password"
          onChange={(value) => update("secretAccessKey", value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() =>
            onSave({
              provider: form.enabled ? "s3" : "none",
              enabled: form.enabled,
              endpoint: form.endpoint.trim(),
              region: form.region.trim() || "auto",
              bucket: form.bucket.trim(),
              publicBaseUrl: form.publicBaseUrl.trim(),
              ...(form.accessKeyId.trim() ? { accessKeyId: form.accessKeyId.trim() } : {}),
              ...(form.secretAccessKey.trim()
                ? { secretAccessKey: form.secretAccessKey.trim() }
                : {})
            })
          }
          className="inline-flex h-9 items-center justify-center rounded-md border border-border-strong bg-ink px-3 text-[12px] font-semibold text-canvas transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save storage"}
        </button>

        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-3 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {uploadPending ? "Uploading..." : "Upload app icon"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            disabled={disabled || uploadPending || !settings.configured}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                onUploadIcon(file);
              }
            }}
          />
        </label>
      </div>

      <StorageObjectExplorer
        objects={objects}
        loading={objectsLoading}
        error={objectsError}
      />
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
    secretAccessKey: ""
  };
}

function StorageObjectExplorer({
  objects,
  loading,
  error
}: {
  objects: StorageObject[];
  loading: boolean;
  error: string | null;
}) {
  const images = objects.filter((object) => object.folder === "images");
  const files = objects.filter((object) => object.folder === "files");

  return (
    <div className="rounded-lg border border-border bg-surface-muted">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Objects</h3>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            Stored metadata grouped by public object prefix.
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {objects.length} objects
        </span>
      </div>

      {error ? (
        <div className="p-4">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : loading ? (
        <div className="p-4 text-[13px] text-muted">Loading objects...</div>
      ) : objects.length === 0 ? (
        <div className="p-4 text-[13px] text-muted">
          Uploaded images and files will appear here.
        </div>
      ) : (
        <div className="divide-y divide-border">
          <StorageFolder
            name="images"
            description="Realm images and user images."
            objects={images}
            icon={<Image className="h-4 w-4" aria-hidden="true" />}
          />
          <StorageFolder
            name="files"
            description="Reserved for generic files."
            objects={files}
            icon={<FileIcon className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      )}
    </div>
  );
}

function StorageFolder({
  name,
  description,
  objects,
  icon
}: {
  name: "images" | "files";
  description: string;
  objects: StorageObject[];
  icon: ReactNode;
}) {
  return (
    <details className="group" open={objects.length > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted">
            <Folder className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[12px] font-semibold text-ink">
              {name}
            </span>
            <span className="mt-0.5 block text-[12px] text-muted">{description}</span>
          </span>
        </span>
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">
          {objects.length}
        </span>
      </summary>

      {objects.length === 0 ? (
        <div className="px-4 pb-4 pl-[4.25rem] text-[12px] text-muted">
          No objects yet.
        </div>
      ) : (
        <div className="px-4 pb-4 pl-[4.25rem]">
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {objects.map((object) => (
              <StorageObjectRow key={object.id} object={object} icon={icon} />
            ))}
          </div>
        </div>
      )}
    </details>
  );
}

function StorageObjectRow({
  object,
  icon
}: {
  object: StorageObject;
  icon: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-border px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              {purposeLabel(object.purpose)}
            </span>
            <span className="text-[12px] text-muted">{formatBytes(object.sizeBytes)}</span>
            <span className="text-[12px] text-muted">{object.mimeType}</span>
          </div>
          <code className="mt-1 block truncate font-mono text-[12px] text-ink-soft">
            {object.objectKey}
          </code>
          <span className="mt-1 block text-[11.5px] text-muted">
            {new Date(object.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
      <a
        href={object.publicUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12px] font-semibold text-ink-soft hover:bg-surface-hover"
      >
        Open
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

function purposeLabel(purpose: StorageObject["purpose"]): string {
  if (purpose === "project_icon") return "Realm image";
  return "User image";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
