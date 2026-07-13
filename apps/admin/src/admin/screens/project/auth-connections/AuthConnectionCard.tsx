import { Server, UserRoundCheck, Wrench } from "lucide-react";

import { Button, Pill, StatusBadge } from "@nezdemkovski/auth-ui";

import {
  AuthConnectionKind,
  type AuthConnection,
  type ServicePermissionCatalogItem
} from "../../../types";
import type { ConfirmedAction, PendingAction } from "./model";
import {
  connectionKindLabel,
  permissionLabel
} from "./model";

export function AuthConnectionCard({
  connection,
  permissionCatalog,
  pendingAction,
  confirmedAction,
  onConfirm,
  onCancelConfirmation,
  onSetDisabled,
  onRotateCredential,
  onDelete
}: {
  connection: AuthConnection;
  permissionCatalog: ServicePermissionCatalogItem[];
  pendingAction: PendingAction | null;
  confirmedAction: ConfirmedAction | null;
  onConfirm: (action: ConfirmedAction) => void;
  onCancelConfirmation: () => void;
  onSetDisabled: () => void;
  onRotateCredential: () => void;
  onDelete: () => void;
}) {
  const pending = pendingAction?.clientId === connection.clientId;
  const confirmation =
    confirmedAction?.clientId === connection.clientId
      ? confirmedAction.action
      : null;
  const Icon =
    connection.kind === AuthConnectionKind.Application
      ? UserRoundCheck
      : connection.kind === AuthConnectionKind.Service
        ? Server
        : Wrench;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-ink-soft">
            <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[14px] font-semibold text-ink">
                {connection.name}
              </h4>
              <Pill>{connectionKindLabel(connection.kind)}</Pill>
              <StatusBadge
                tone={connection.disabled ? "neutral" : "success"}
                label={connection.disabled ? "Disabled" : "Connected"}
              />
            </div>
            <ConnectionSummary
              connection={connection}
              permissionCatalog={permissionCatalog}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            loading={
              pendingAction?.clientId === connection.clientId &&
              pendingAction.action === "toggle"
            }
            onClick={onSetDisabled}
          >
            {connection.disabled ? "Enable" : "Disable"}
          </Button>
          {connection.canRotateCredential ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                onConfirm({ clientId: connection.clientId, action: "rotate" })
              }
            >
              Rotate credential
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              onConfirm({ clientId: connection.clientId, action: "delete" })
            }
          >
            Delete
          </Button>
        </div>
      </div>

      <details className="mt-3 text-[11.5px] text-muted">
        <summary className="min-h-10 cursor-pointer select-none py-2 outline-none hover:text-ink-soft focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Technical details
        </summary>
        <code className="block break-all rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-[11px]">
          Connection ID: {connection.clientId}
        </code>
      </details>

      {confirmation ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5">
          <p className="text-[12.5px] leading-5 text-ink-soft">
            {confirmation === "rotate"
              ? "The current credential will stop working immediately."
              : "This connection will no longer be able to authenticate."}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={onCancelConfirmation}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={confirmation === "delete" ? "danger" : "primary"}
              loading={pending}
              onClick={
                confirmation === "rotate" ? onRotateCredential : onDelete
              }
            >
              {confirmation === "rotate" ? "Rotate now" : "Delete permanently"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionSummary({
  connection,
  permissionCatalog
}: {
  connection: AuthConnection;
  permissionCatalog: ServicePermissionCatalogItem[];
}) {
  if (connection.kind === AuthConnectionKind.Application) {
    return (
      <p className="mt-1 max-w-[42rem] break-all text-[11.5px] leading-5 text-muted">
        Users return to {connection.callbackUrl ?? "the configured app backend"}
      </p>
    );
  }
  if (connection.kind === AuthConnectionKind.Service) {
    return (
      <p className="mt-1 text-[11.5px] leading-5 text-muted">
        Can {connection.permissions
          .map((permission) => permissionLabel(permission, permissionCatalog))
          .join(", ")}
      </p>
    );
  }
  return (
    <p className="mt-1 text-[11.5px] leading-5 text-muted">
      Imported OAuth configuration. Raw protocol controls stay outside the normal
      setup flow.
    </p>
  );
}
