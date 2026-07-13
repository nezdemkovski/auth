import {
  Button,
  Pill,
  StatusBadge
} from "@nezdemkovski/auth-ui";

import type { OAuthClient } from "../../../types";
import type { ConfirmedAction, PendingAction } from "./model";
import { profileLabel } from "./model";

export function OAuthClientCard({
  client,
  pendingAction,
  confirmedAction,
  onConfirm,
  onCancelConfirmation,
  onSetDisabled,
  onRotateSecret,
  onDelete
}: {
  client: OAuthClient;
  pendingAction: PendingAction | null;
  confirmedAction: ConfirmedAction | null;
  onConfirm: (action: ConfirmedAction) => void;
  onCancelConfirmation: () => void;
  onSetDisabled: () => void;
  onRotateSecret: () => void;
  onDelete: () => void;
}) {
  const pending = pendingAction?.clientId === client.clientId;
  const confirmation =
    confirmedAction?.clientId === client.clientId ? confirmedAction.action : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[14px] font-semibold text-ink">{client.name}</h4>
            <Pill>{profileLabel(client.profile)}</Pill>
            <StatusBadge
              tone={client.disabled ? "neutral" : "success"}
              label={client.disabled ? "Disabled" : "Enabled"}
            />
          </div>
          <code className="mt-2 block break-all font-mono text-[11.5px] text-muted">
            {client.clientId}
          </code>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            loading={
              pendingAction?.clientId === client.clientId &&
              pendingAction.action === "toggle"
            }
            onClick={onSetDisabled}
          >
            {client.disabled ? "Enable" : "Disable"}
          </Button>
          {!client.public && client.secretConfigured ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                onConfirm({ clientId: client.clientId, action: "rotate" })
              }
            >
              Rotate secret
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => onConfirm({ clientId: client.clientId, action: "delete" })}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-[12px] leading-5 text-ink-soft md:grid-cols-3">
        <ClientValues label="Scopes" values={client.scopes} />
        <ClientValues label="Redirect URIs" values={client.redirectUris} />
        <ClientValues label="Resources" values={client.resources} />
      </div>

      {confirmation ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5">
          <p className="text-[12.5px] leading-5 text-ink-soft">
            {confirmation === "rotate"
              ? "The current secret will stop working immediately."
              : "This client will no longer be able to authenticate."}
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
              onClick={confirmation === "rotate" ? onRotateSecret : onDelete}
            >
              {confirmation === "rotate" ? "Rotate now" : "Delete permanently"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClientValues({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-muted p-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div className="mt-1.5 break-all">
        {values.length > 0 ? values.join(" · ") : "—"}
      </div>
    </div>
  );
}
