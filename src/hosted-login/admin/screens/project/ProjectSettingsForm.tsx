import type React from "react";
import { useEffect, useState } from "react";

import type { ProjectSettingsPatch, ProjectSummary } from "../../types";
import { projectToSettingsForm } from "../../utils/format";
import { FormAlert, SettingsInput, SettingsTextarea } from "../../components/primitives";

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
      setLocalError("Project name is required.");
      return;
    }

    setLocalError(null);
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      iconUrl: form.iconUrl.trim(),
      appUrl: form.appUrl.trim(),
      trustedOrigins
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
            These settings are stored in Postgres and override the bootstrap values
            from the environment.
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
          System project settings are read-only from this dashboard.
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
          placeholder="https://example.com/icon.png"
          onChange={(value) => update("iconUrl", value)}
        />
        <SettingsInput
          id="project-app-url"
          label="App URL"
          value={form.appUrl}
          disabled={project.system}
          placeholder="https://app.example.com"
          onChange={(value) => update("appUrl", value)}
        />
        <SettingsTextarea
          id="project-origins"
          label="Trusted origins"
          value={form.trustedOrigins}
          disabled={project.system}
          placeholder="https://openmarkers.app"
          rows={4}
          onChange={(value) => update("trustedOrigins", value)}
        />
      </div>

      <SettingsTextarea
        id="project-description"
        label="Description"
        value={form.description}
        disabled={project.system}
        placeholder="Short internal description for this app."
        rows={3}
        onChange={(value) => update("description", value)}
      />

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
