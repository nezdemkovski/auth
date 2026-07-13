import type React from "react";
import { useState } from "react";
import { ArrowRight, Server, UserRoundCheck, X } from "lucide-react";

import { Button, SettingsInput } from "@nezdemkovski/auth-ui";

import {
  AuthConnectionKind,
  type CreateAuthConnectionInput,
  type ServicePermission,
  type ServicePermissionCatalogItem
} from "../../../types";
import { applicationCallbackUrl } from "./model";

export function AuthConnectionCreate({
  project,
  permissions,
  pending,
  onCreate
}: {
  project: string;
  permissions: ServicePermissionCatalogItem[];
  pending: boolean;
  onCreate: (input: CreateAuthConnectionInput) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<AuthConnectionKind | null>(null);

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4 sm:p-5">
      <div className="max-w-[40rem]">
        <span className="eyebrow">Connect</span>
        <h3 className="mt-2 text-balance text-[20px] font-semibold tracking-[-0.02em] text-ink">
          What needs access?
        </h3>
        <p className="mt-1 text-pretty text-[12.5px] leading-5 text-muted">
          Pick the job. The server applies the secure Better Auth and OAuth setup
          automatically.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ConnectionChoice
          selected={kind === AuthConnectionKind.Application}
          icon={<UserRoundCheck aria-hidden="true" size={19} strokeWidth={1.8} />}
          title="Add sign-in to an app"
          description="People sign in through this realm; the app backend keeps their session."
          flow="People → app"
          onClick={() => setKind(AuthConnectionKind.Application)}
        />
        <ConnectionChoice
          selected={kind === AuthConnectionKind.Service}
          icon={<Server aria-hidden="true" size={19} strokeWidth={1.8} />}
          title="Create a service credential"
          description="A trusted backend calls realm services without a person signing in."
          flow="Backend → billing"
          onClick={() => setKind(AuthConnectionKind.Service)}
        />
      </div>

      {kind === AuthConnectionKind.Application ? (
        <ApplicationForm
          key={kind}
          project={project}
          pending={pending}
          onCancel={() => setKind(null)}
          onCreate={onCreate}
        />
      ) : null}
      {kind === AuthConnectionKind.Service ? (
        <ServiceForm
          key={kind}
          project={project}
          permissions={permissions}
          pending={pending}
          onCancel={() => setKind(null)}
          onCreate={onCreate}
        />
      ) : null}
    </div>
  );
}

function ConnectionChoice({
  selected,
  icon,
  title,
  description,
  flow,
  onClick
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  flow: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="group min-h-11 rounded-xl border border-border bg-surface p-4 text-left outline-none transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:scale-[0.99] aria-pressed:border-border-strong aria-pressed:shadow-[0_0_0_3px_var(--focus-ring)]"
    >
      <span className="flex items-center justify-between gap-3 text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-muted">
          {icon}
        </span>
        <ArrowRight
          aria-hidden="true"
          size={16}
          className="text-muted transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </span>
      <span className="mt-3 block text-[14px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </span>
      <span className="mt-1 block max-w-[26rem] text-pretty text-[12px] leading-5 text-muted">
        {description}
      </span>
      <span className="mt-3 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-soft">
        {flow}
      </span>
    </button>
  );
}

function ApplicationForm({
  project,
  pending,
  onCancel,
  onCreate
}: {
  project: string;
  pending: boolean;
  onCancel: () => void;
  onCreate: (input: CreateAuthConnectionInput) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [backendUrl, setBackendUrl] = useState("");
  const callbackUrl = applicationCallbackUrl(backendUrl);
  const ready = name.trim().length > 0 && callbackUrl !== null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) {
      return;
    }
    const created = await onCreate({
      kind: AuthConnectionKind.Application,
      name: name.trim(),
      backendUrl: backendUrl.trim()
    });
    if (created) {
      onCancel();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <FormHeading
        title="Connect an app"
        description="Tell us where its Better Auth backend runs. We derive the callback and login policy."
        onCancel={onCancel}
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SettingsInput
          id={`${project}-connection-app-name`}
          label="App name"
          value={name}
          disabled={pending}
          placeholder="Demo App"
          onChange={setName}
        />
        <SettingsInput
          id={`${project}-connection-backend-url`}
          label="Backend URL"
          value={backendUrl}
          disabled={pending}
          placeholder="https://api.demo.example.com"
          onChange={setBackendUrl}
        />
      </div>
      {callbackUrl ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
          <div className="text-[11.5px] font-medium text-ink-soft">
            Sign-in returns to
          </div>
          <code className="mt-1 block break-all font-mono text-[11px] leading-5 text-muted">
            {callbackUrl}
          </code>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={!ready}
        >
          {pending ? "Connecting…" : "Connect app"}
        </Button>
      </div>
    </form>
  );
}

function ServiceForm({
  project,
  permissions,
  pending,
  onCancel,
  onCreate
}: {
  project: string;
  permissions: ServicePermissionCatalogItem[];
  pending: boolean;
  onCancel: () => void;
  onCreate: (input: CreateAuthConnectionInput) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ServicePermission[]>(() =>
    permissions.map((permission) => permission.id)
  );
  const ready = name.trim().length > 0 && selected.length > 0;

  const togglePermission = (permission: ServicePermission) => {
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) {
      return;
    }
    const created = await onCreate({
      kind: AuthConnectionKind.Service,
      name: name.trim(),
      permissions: selected
    });
    if (created) {
      onCancel();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <FormHeading
        title="Create a service credential"
        description="Give one trusted backend only the capabilities it needs."
        onCancel={onCancel}
      />
      <div className="mt-4 max-w-[28rem]">
        <SettingsInput
          id={`${project}-connection-service-name`}
          label="Credential name"
          value={name}
          disabled={pending}
          placeholder="Billing worker"
          onChange={setName}
        />
      </div>
      <fieldset className="mt-4">
        <legend className="text-[12.5px] font-medium text-ink-soft">
          What can it do?
        </legend>
        <div className="mt-2 grid gap-2">
          {permissions.map((permission) => (
            <label
              key={permission.id}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={selected.includes(permission.id)}
                disabled={pending}
                onChange={() => togglePermission(permission.id)}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[12.5px] font-medium text-ink">
                  {permission.name}
                </span>
                <span className="mt-0.5 block text-pretty text-[11.5px] leading-5 text-muted">
                  {permission.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={!ready}
        >
          {pending ? "Creating…" : "Create credential"}
        </Button>
      </div>
    </form>
  );
}

function FormHeading({
  title,
  description,
  onCancel
}: {
  title: string;
  description: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h4 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h4>
        <p className="mt-1 max-w-[36rem] text-pretty text-[12px] leading-5 text-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-[background-color,color,transform] duration-150 hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:scale-[0.96]"
      >
        <X aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
