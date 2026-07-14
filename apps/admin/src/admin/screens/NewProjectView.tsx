import type React from "react";
import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import {
  Button,
  Card,
  FormAlert,
  Pill,
  PrimaryButton,
  SettingsInput
} from "@nezdemkovski/auth-ui";

import type { CreatedProject, CreateProjectInput } from "../types";
import { buildRealmSetupEnvironment } from "./project/auth-connections/environment";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function NewProjectView({
  pending,
  created,
  error,
  onSubmit,
  onOpenRealm
}: {
  pending: boolean;
  created: CreatedProject | null;
  error: string | null;
  onSubmit: (input: CreateProjectInput) => void;
  onOpenRealm: (projectSlug: string) => void;
}) {
  const [form, setForm] = useState<CreateProjectInput>({
    slug: "",
    name: "",
    appUrl: ""
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (created) {
    return <RealmReady created={created} onOpenRealm={onOpenRealm} />;
  }

  const updateName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      ...(slugEdited ? {} : { slug: normalizeSlug(name) })
    }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const slug = normalizeSlug(form.slug || form.name);
    if (!form.name.trim()) {
      setLocalError("App name is required.");
      return;
    }
    if (!SLUG_PATTERN.test(slug)) {
      setLocalError("Internal ID must contain letters, numbers, and hyphens.");
      return;
    }
    if (!isOrigin(form.appUrl)) {
      setLocalError("App address must look like https://myapp.com.");
      return;
    }

    setLocalError(null);
    onSubmit({
      slug,
      name: form.name.trim(),
      appUrl: form.appUrl.trim()
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">New app</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Add your <em>app.</em>
        </h1>
        <p className="mt-3 max-w-[38rem] text-[14.5px] leading-[1.55] text-muted">
          Give it a name and the address people open. We create everything else.
        </p>
      </div>

      <Card padding={false}>
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          <SettingsInput
            id="new-project-name"
            label="App name"
            value={form.name}
            placeholder="Demo App"
            onChange={updateName}
          />

          <SettingsInput
            id="new-project-app-url"
            label="App address"
            value={form.appUrl}
            placeholder="https://myapp.com"
            onChange={(appUrl) =>
              setForm((current) => ({ ...current, appUrl }))
            }
          />

          <details className="rounded-lg border border-border bg-surface-muted">
            <summary className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 px-3 text-[12.5px] font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <span>Advanced</span>
              <span className="text-[11px] font-normal text-muted">
                Most apps can skip this
              </span>
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              <SettingsInput
                id="new-project-slug"
                label="Internal ID"
                value={form.slug}
                placeholder="demo-app"
                onChange={(slug) => {
                  setSlugEdited(true);
                  setForm((current) => ({ ...current, slug }));
                }}
              />
            </div>
          </details>

          {localError || error ? (
            <FormAlert>{localError ?? error}</FormAlert>
          ) : null}

          <div className="max-w-[220px]">
            <PrimaryButton type="submit" loading={pending}>
              {pending ? "Creating app…" : "Create app"}
            </PrimaryButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

function RealmReady({
  created,
  onOpenRealm
}: {
  created: CreatedProject;
  onOpenRealm: (projectSlug: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const environment = buildRealmSetupEnvironment(created.setup);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(environment);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopyError(
        "Could not copy automatically. Select the block and copy it manually."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">App ready</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Copy. Paste. <em>Done.</em>
        </h1>
        <p className="mt-3 max-w-[42rem] text-[14.5px] leading-[1.55] text-muted">
          Add this block to the app's private environment. It contains the
          complete sign-in setup for
          {` ${created.project.name}.`}
        </p>
      </div>

      <Card padding={false}>
        <div className="border-b border-border p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-ink-soft">
                <KeyRound aria-hidden="true" size={18} strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  App settings
                </h2>
                <p className="mt-1 text-[12.5px] leading-5 text-muted">
                  No secret to guard: this is a public client. Paste the block
                  into the app's environment and sign-in works.
                </p>
              </div>
            </div>
            <Pill>copy-ready</Pill>
          </div>

          <pre className="mt-5 overflow-x-auto rounded-xl border border-border-strong bg-surface-muted p-4 font-mono text-[12px] leading-6 text-ink">
            {environment}
          </pre>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="sm"
              leading={
                copied ? (
                  <Check aria-hidden="true" size={14} />
                ) : (
                  <Copy aria-hidden="true" size={14} />
                )
              }
              onClick={() => void copy()}
            >
              {copied ? "Copied" : "Copy env"}
            </Button>
          </div>
          {copyError ? (
            <div className="mt-3">
              <FormAlert>{copyError}</FormAlert>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-6">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-soft">
            <Check
              aria-hidden="true"
              size={15}
              strokeWidth={2}
              className="text-success"
            />
            Sign-in is ready. MCP access is ready.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenRealm(created.project.slug)}
          >
            Open app settings
          </Button>
        </div>
      </Card>
    </div>
  );
}

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const isOrigin = (value: string) => {
  try {
    const url = new URL(value.trim());
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      ["", "/"].includes(url.pathname)
    );
  } catch {
    return false;
  }
};
