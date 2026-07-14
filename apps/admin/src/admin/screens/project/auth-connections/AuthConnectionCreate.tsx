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
  projectName,
  appUrl,
  pending,
  onCreate
}: {
  project: string;
  projectName: string;
  appUrl: string;
  pending: boolean;
  onCreate: (input: CreateAuthConnectionInput) => Promise<boolean>;
}) {
  const connectionUrl = appUrl.trim();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connectionUrl) {
      return;
    }
    await onCreate({
      kind: AuthConnectionKind.Application,
      name: `${projectName} app`,
      appUrl: connectionUrl
    });
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <h3 className="text-[14px] font-semibold text-ink">
          Connect {projectName}
        </h3>
        <p className="mt-1 max-w-[38rem] text-[12px] leading-5 text-muted">
          We will use the app address already saved in Settings and give you one
          setup block to copy. Sign-in returns to that address.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted">App address</div>
          <div className="mt-0.5 truncate text-[13px] text-ink-soft">
            {connectionUrl || "Add an app address in Settings first"}
          </div>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={!connectionUrl}
        >
          Connect app
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
        <h4 className="text-[13px] font-semibold text-ink">Create server key</h4>
        <p className="mt-1 text-[11.5px] leading-5 text-muted">
          Only for a background process that records usage without a signed-in
          user. Most apps do not need this.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SettingsInput
            id={`${project}-service-key-name`}
            label="Name"
            value={name}
            disabled={pending}
            placeholder="Production usage sync"
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
          Create server key
        </Button>
      </div>
    </form>
  );
}
