import type React from "react";
import { useMemo, useState } from "react";

import type { CreateProjectInput } from "../types";
import {
  Card,
  FormAlert,
  PrimaryButton,
  SettingsInput,
  SettingsTextarea
} from "../components/primitives";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

type NewProjectForm = CreateProjectInput & {
  trustedOriginsText: string;
};

export function NewProjectView({
  pending,
  error,
  onSubmit
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (input: CreateProjectInput) => void;
}) {
  const [form, setForm] = useState<NewProjectForm>({
    slug: "",
    name: "",
    description: "",
    iconUrl: "",
    appUrl: "",
    trustedOrigins: [],
    trustedOriginsText: ""
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const schemaPreview = useMemo(() => {
    const slug = normalizeSlug(form.slug);
    return slug ? `${slug.replaceAll("-", "_")}_auth` : "project_auth";
  }, [form.slug]);

  function update<K extends keyof NewProjectForm>(key: K, value: NewProjectForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const slug = normalizeSlug(form.slug);
    const trustedOrigins = form.trustedOriginsText
      .split("\n")
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (form.name.trim().length === 0) {
      setLocalError("Project name is required.");
      return;
    }

    if (!SLUG_PATTERN.test(slug)) {
      setLocalError("Use a slug like openmarkers or customer-portal.");
      return;
    }

    setLocalError(null);
    onSubmit({
      slug,
      name: form.name.trim(),
      description: form.description.trim(),
      iconUrl: form.iconUrl.trim(),
      appUrl: form.appUrl.trim(),
      trustedOrigins
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">02 — New project</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Create <em>realm.</em>
        </h1>
        <p className="mt-3 max-w-[38rem] text-[14.5px] leading-[1.55] text-muted">
          Each project gets its own Postgres schema, Better Auth tables, trusted
          origins, and hosted login surface.
        </p>
      </div>

      <Card padding={false}>
        <form onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsInput
              id="new-project-name"
              label="Name"
              value={form.name}
              placeholder="OpenMarkers"
              onChange={(value) => update("name", value)}
            />
            <SettingsInput
              id="new-project-slug"
              label="Slug"
              value={form.slug}
              placeholder="openmarkers"
              onChange={(value) => update("slug", value)}
            />
            <SettingsInput
              id="new-project-app-url"
              label="App URL"
              value={form.appUrl}
              placeholder="https://openmarkers.app"
              onChange={(value) => update("appUrl", value)}
            />
            <SettingsInput
              id="new-project-icon-url"
              label="Icon URL"
              value={form.iconUrl}
              placeholder="https://openmarkers.app/icon.png"
              onChange={(value) => update("iconUrl", value)}
            />
          </div>

          <SettingsTextarea
            id="new-project-origins"
            label="Trusted origins"
            value={form.trustedOriginsText}
            placeholder="https://openmarkers.app"
            rows={4}
            onChange={(value) => update("trustedOriginsText", value)}
          />

          <SettingsTextarea
            id="new-project-description"
            label="Description"
            value={form.description}
            placeholder="Short internal description for this app."
            rows={3}
            onChange={(value) => update("description", value)}
          />

          <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[12.5px] leading-5 text-muted">
            Schema preview:{" "}
            <code className="font-mono text-ink-soft">{schemaPreview}</code>
          </div>

          {localError || error ? <FormAlert>{localError ?? error}</FormAlert> : null}

          <div className="max-w-[220px]">
            <PrimaryButton type="submit" loading={pending}>
              Create project
            </PrimaryButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
