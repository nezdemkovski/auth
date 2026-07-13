import type React from "react";
import { useState } from "react";
import { Check, Copy, KeyRound, Waypoints } from "lucide-react";

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
    appUrl: "",
    backendUrl: ""
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
      setLocalError("Realm ID must contain letters, numbers, and hyphens.");
      return;
    }
    if (!isOrigin(form.appUrl)) {
      setLocalError("Web app URL must be an origin such as https://app.example.com.");
      return;
    }
    if (!isOrigin(form.backendUrl)) {
      setLocalError(
        "Backend URL must be an origin such as https://api.example.com."
      );
      return;
    }

    setLocalError(null);
    onSubmit({
      slug,
      name: form.name.trim(),
      appUrl: form.appUrl.trim(),
      backendUrl: form.backendUrl.trim()
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">New realm</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Connect your <em>app.</em>
        </h1>
        <p className="mt-3 max-w-[38rem] text-[14.5px] leading-[1.55] text-muted">
          Three fields. We create the isolated realm, register the secure
          callback, and prepare MCP discovery automatically.
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

          <div className="grid gap-4 md:grid-cols-2">
            <SettingsInput
              id="new-project-app-url"
              label="Web app URL"
              value={form.appUrl}
              placeholder="https://app.example.com"
              onChange={(appUrl) =>
                setForm((current) => ({ ...current, appUrl }))
              }
            />
            <SettingsInput
              id="new-project-backend-url"
              label="Backend URL"
              value={form.backendUrl}
              placeholder="https://api.example.com"
              onChange={(backendUrl) =>
                setForm((current) => ({ ...current, backendUrl }))
              }
            />
          </div>

          <details className="rounded-lg border border-border bg-surface-muted">
            <summary className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 px-3 text-[12.5px] font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <span>Customize realm ID</span>
              <code className="font-mono text-[11px] text-muted">
                {form.slug || "demo-app"}
              </code>
            </summary>
            <div className="border-t border-border p-3">
              <SettingsInput
                id="new-project-slug"
                label="Realm ID"
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
              {pending ? "Creating realm…" : "Create realm"}
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
          <span className="eyebrow">Realm ready</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Copy. Paste. <em>Done.</em>
        </h1>
        <p className="mt-3 max-w-[42rem] text-[14.5px] leading-[1.55] text-muted">
          Add this block to the app backend. It is the complete auth setup for
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
                  Backend environment
                </h2>
                <p className="mt-1 text-[12.5px] leading-5 text-muted">
                  The secret is shown once. Store it with the app, never in the
                  browser.
                </p>
              </div>
            </div>
            <Pill>shown once</Pill>
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

        <div className="grid gap-px bg-border sm:grid-cols-3">
          <ReadyItem label="Login" detail="App callback registered" />
          <ReadyItem label="Sessions" detail="Better Auth owns the flow" />
          <ReadyItem label="MCP auth" detail="Discovery is enabled" />
        </div>
      </Card>

      <div className="rounded-xl border border-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Waypoints
              aria-hidden="true"
              size={18}
              strokeWidth={1.8}
              className="mt-0.5 text-ink-soft"
            />
            <div>
              <div className="text-[13px] font-semibold text-ink">
                One issuer for the whole realm
              </div>
              <code className="mt-1 block break-all font-mono text-[11.5px] text-muted">
                {created.setup.issuer}
              </code>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenRealm(created.project.slug)}
          >
            Open realm
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReadyItem({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 bg-surface px-4 py-3.5">
      <Check
        aria-hidden="true"
        size={14}
        strokeWidth={2}
        className="mt-0.5 text-success"
      />
      <div>
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">{detail}</div>
      </div>
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
