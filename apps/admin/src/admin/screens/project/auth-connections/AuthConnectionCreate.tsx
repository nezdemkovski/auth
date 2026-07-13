import type React from "react";
import { useState } from "react";

import { Button, SettingsInput } from "@nezdemkovski/auth-ui";

import {
  AuthConnectionKind,
  ServicePermission,
  type CreateAuthConnectionInput,
  type ServicePermissionCatalogItem
} from "../../../types";

export function AppSetupForm({
  project,
  projectName,
  pending,
  onCreate
}: {
  project: string;
  projectName: string;
  pending: boolean;
  onCreate: (input: CreateAuthConnectionInput) => Promise<boolean>;
}) {
  const [backendUrl, setBackendUrl] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!backendUrl.trim()) {
      return;
    }
    await onCreate({
      kind: AuthConnectionKind.Application,
      name: `${projectName} backend`,
      backendUrl: backendUrl.trim()
    });
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <h3 className="text-[14px] font-semibold text-ink">Connect the app</h3>
        <p className="mt-1 max-w-[38rem] text-[12px] leading-5 text-muted">
          Enter the app backend URL. We register the callback and generate the
          complete environment block.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SettingsInput
            id={`${project}-app-backend-url`}
            label="Backend URL"
            value={backendUrl}
            disabled={pending}
            placeholder="https://api.example.com"
            onChange={setBackendUrl}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={!backendUrl.trim()}
          className="sm:mb-px"
        >
          Generate setup
        </Button>
      </div>
    </form>
  );
}

export function ServiceCredentialCreate({
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
  const [name, setName] = useState("");
  const billingPermissionAvailable = permissions.some(
    (permission) => permission.id === ServicePermission.BillingUsageWrite
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !billingPermissionAvailable) {
      return;
    }
    const created = await onCreate({
      kind: AuthConnectionKind.Service,
      name: name.trim(),
      permissions: [ServicePermission.BillingUsageWrite]
    });
    if (created) {
      setName("");
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <div>
        <h4 className="text-[13px] font-semibold text-ink">Create API key</h4>
        <p className="mt-1 text-[11.5px] leading-5 text-muted">
          For a trusted backend that calls realm-owned platform APIs. Never put
          this key in a browser or mobile bundle.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SettingsInput
            id={`${project}-service-key-name`}
            label="Key name"
            value={name}
            disabled={pending}
            placeholder="Billing worker"
            onChange={setName}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          loading={pending}
          disabled={!name.trim() || !billingPermissionAvailable}
          className="sm:mb-px"
        >
          Create key
        </Button>
      </div>
    </form>
  );
}
