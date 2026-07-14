import { useState } from "react";
import { KeyRound, RotateCcw } from "lucide-react";

import {
  Button,
  FormAlert,
  Pill,
  StatusBadge
} from "@nezdemkovski/auth-ui";

import {
  AuthConnectionKind,
  type AuthConnection,
  type AuthConnectionCredential,
  type AuthConnectionsResponse,
  type CreateAuthConnectionInput
} from "../../../types";
import { AuthConnectionCard } from "./AuthConnectionCard";
import {
  AppSetupForm,
  ServiceCredentialCreate
} from "./AuthConnectionCreate";
import {
  AuthConnectionCredentialPanel,
  type VisibleAuthConnectionCredential
} from "./AuthConnectionCredentialPanel";
import type { ConfirmedAction, PendingAction } from "./model";
import { errorMessage } from "./model";

export function AuthConnectionSettings({
  project,
  projectName,
  appUrl,
  issuer,
  data,
  loading,
  loadError,
  onCreate,
  onSetDisabled,
  onRotateCredential,
  onDelete
}: {
  project: string;
  projectName: string;
  appUrl: string;
  issuer: string;
  data: AuthConnectionsResponse | undefined;
  loading: boolean;
  loadError: boolean;
  onCreate: (
    input: CreateAuthConnectionInput
  ) => Promise<AuthConnectionCredential>;
  onSetDisabled: (clientId: string, disabled: boolean) => Promise<void>;
  onRotateCredential: (clientId: string) => Promise<AuthConnectionCredential>;
  onDelete: (clientId: string) => Promise<void>;
}) {
  const connections = data?.connections ?? [];
  const app = connections.find(
    (connection) => connection.kind === AuthConnectionKind.Application
  );
  const apiKeys = connections.filter(
    (connection) => connection.kind === AuthConnectionKind.Service
  );
  const permissionCatalog = data?.catalog.servicePermissions ?? [];
  const [credential, setCredential] =
    useState<VisibleAuthConnectionCredential | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedAction | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const create = async (input: CreateAuthConnectionInput) => {
    setError(null);
    setPendingAction({ clientId: "new", action: "create" });
    try {
      const nextCredential = await onCreate(input);
      setCredential({
        name: input.name,
        kind: input.kind,
        credential: nextCredential
      });
      return true;
    } catch (caught) {
      setError(errorMessage(caught, "Could not generate setup"));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const setDisabled = async (connection: AuthConnection) => {
    setError(null);
    setPendingAction({ clientId: connection.clientId, action: "toggle" });
    try {
      await onSetDisabled(connection.clientId, !connection.disabled);
    } catch (caught) {
      setError(errorMessage(caught, "Could not update access"));
    } finally {
      setPendingAction(null);
    }
  };

  const rotateCredential = async (connection: AuthConnection) => {
    setError(null);
    setPendingAction({ clientId: connection.clientId, action: "rotate" });
    try {
      const nextCredential = await onRotateCredential(connection.clientId);
      setCredential({
        name: connection.name,
        kind: connection.kind,
        credential: nextCredential
      });
      setConfirmedAction(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not rotate keys"));
    } finally {
      setPendingAction(null);
    }
  };

  const deleteConnection = async (connection: AuthConnection) => {
    setError(null);
    setPendingAction({ clientId: connection.clientId, action: "delete" });
    try {
      await onDelete(connection.clientId);
      setConfirmedAction(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not delete API key"));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-5 p-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Connect your app
        </h2>
        <p className="mt-1 max-w-[45rem] text-pretty text-[12.5px] leading-5 text-muted">
          Copy one private setup block into your app. Sign-in works immediately,
          and MCP clients connect automatically.
        </p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      {credential ? (
        <AuthConnectionCredentialPanel
          issuer={issuer}
          visible={credential}
          onDismiss={() => setCredential(null)}
          onCopyError={(message) => setError(message)}
        />
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface-muted p-4 text-[13px] text-muted">
          Loading setup…
        </div>
      ) : loadError ? (
        <FormAlert>Could not load app setup.</FormAlert>
      ) : app ? (
        <PrimaryAppSetup
          app={app}
          issuer={issuer}
          pending={pendingAction?.clientId === app.clientId}
          confirmed={
            confirmedAction?.clientId === app.clientId &&
            confirmedAction.action === "rotate"
          }
          onConfirmRotate={() =>
            setConfirmedAction({ clientId: app.clientId, action: "rotate" })
          }
          onCancel={() => setConfirmedAction(null)}
          onRotate={() => void rotateCredential(app)}
          onEnable={() => void setDisabled(app)}
        />
      ) : (
        <AppSetupForm
          project={project}
          projectName={projectName}
          appUrl={appUrl}
          pending={pendingAction?.clientId === "new"}
          onCreate={create}
        />
      )}

      <details className="rounded-xl border border-border bg-surface-muted">
        <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-3 px-4 text-[12.5px] font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span className="flex items-center gap-2">
            <KeyRound aria-hidden="true" size={15} />
            Advanced
          </span>
          {apiKeys.length > 0 ? <Pill>{apiKeys.length}</Pill> : null}
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">
              Server-to-server access
            </h3>
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              For rare background jobs that call platform features without a
              signed-in user. This is unrelated to normal app sign-in.
            </p>
          </div>
          <ServiceCredentialCreate
            project={project}
            permissions={permissionCatalog}
            pending={pendingAction?.clientId === "new"}
            onCreate={create}
          />

          {apiKeys.map((connection) => (
            <AuthConnectionCard
              key={connection.clientId}
              connection={connection}
              permissionCatalog={permissionCatalog}
              pendingAction={pendingAction}
              confirmedAction={confirmedAction}
              onConfirm={setConfirmedAction}
              onCancelConfirmation={() => setConfirmedAction(null)}
              onSetDisabled={() => void setDisabled(connection)}
              onRotateCredential={() => void rotateCredential(connection)}
              onDelete={() => void deleteConnection(connection)}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function PrimaryAppSetup({
  app,
  issuer,
  pending,
  confirmed,
  onConfirmRotate,
  onCancel,
  onRotate,
  onEnable
}: {
  app: AuthConnection;
  issuer: string;
  pending: boolean;
  confirmed: boolean;
  onConfirmRotate: () => void;
  onCancel: () => void;
  onRotate: () => void;
  onEnable: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink">App connected</h3>
            <StatusBadge
              tone={app.disabled ? "neutral" : "success"}
              label={app.disabled ? "Paused" : "Active"}
            />
          </div>
          <p className="mt-1 text-[11.5px] leading-5 text-muted">
            Sign-in returns to {connectionAddress(app.callbackUrl)}.
          </p>
        </div>
        <div className="flex gap-2">
          {app.disabled ? (
            <Button type="button" size="sm" loading={pending} onClick={onEnable}>
              Resume
            </Button>
          ) : null}
          {app.canRotateCredential ? (
            <Button
              type="button"
              size="sm"
              leading={<RotateCcw aria-hidden="true" size={13} />}
              disabled={pending}
              onClick={onConfirmRotate}
            >
              Replace keys
            </Button>
          ) : null}
        </div>
      </div>

      <details className="mt-3 text-[11.5px] text-muted">
        <summary className="min-h-10 cursor-pointer select-none py-2 outline-none hover:text-ink-soft focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Technical details
        </summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <SetupValue label="Issuer" value={issuer} />
          <SetupValue label="Client ID" value={app.clientId} />
        </div>
      </details>

      {confirmed ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5">
          <p className="text-[12px] leading-5 text-ink-soft">
            New keys replace the current secret immediately.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={pending}
              onClick={onRotate}
            >
              Replace keys
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SetupValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <code className="mt-1 block break-all font-mono text-[11px] leading-5 text-ink-soft">
        {value}
      </code>
    </div>
  );
}

const connectionAddress = (callbackUrl: string | null) => {
  if (!callbackUrl) {
    return "the app";
  }
  try {
    return new URL(callbackUrl).origin;
  } catch {
    return "the app";
  }
};
