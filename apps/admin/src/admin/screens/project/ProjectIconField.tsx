import { useEffect, useState } from "react";

import { SettingsInput } from "@nezdemkovski/auth-ui";

import type { StorageObject } from "../../types";

export function ProjectIconField({
  value,
  storageConfigured,
  disabled,
  uploadPending,
  uploadedIcon,
  onUrlChange,
  onUpload
}: {
  value: string;
  storageConfigured: boolean;
  disabled: boolean;
  uploadPending: boolean;
  uploadedIcon: StorageObject | null;
  onUrlChange: (value: string) => void;
  onUpload: (file: File) => void;
}) {
  const [resolution, setResolution] = useState<string | null>(null);

  useEffect(() => {
    setResolution(null);
  }, [value]);

  if (!storageConfigured) {
    return (
      <SettingsInput
        id="project-icon"
        label="Icon URL"
        value={value}
        disabled={disabled}
        placeholder="https://app.domain.com/icon.png"
        onChange={onUrlChange}
      />
    );
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-medium text-ink-soft">Icon</span>
      <div className="flex min-h-10 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
        {value ? (
          <img
            src={value}
            alt=""
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                setResolution(`${image.naturalWidth}x${image.naturalHeight}`);
              }
            }}
            className="h-7 w-7 rounded-md border border-border object-cover"
          />
        ) : (
          <span className="h-7 w-7 rounded-md border border-border bg-surface-muted" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
          {value ? (
            <>
              {uploadedIcon?.originalFileName ? (
                <span className="text-ink-soft">{uploadedIcon.originalFileName}</span>
              ) : null}
              {resolution ? <span className="ml-2 text-muted">{resolution}</span> : null}
            </>
          ) : (
            "No icon uploaded"
          )}
        </span>
        <label className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-muted px-2.5 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {uploadPending ? "Uploading..." : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            disabled={disabled || uploadPending}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                onUpload(file);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}
