import type React from "react";
import { useState } from "react";
import { Check, KeyRound, RotateCcw, Waypoints } from "lucide-react";

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
  issuer,
  mcpReady,
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
  issuer: string;
  mcpReady: boolean;
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
          App setup
        </h2>
        <p className="mt-1 max-w-[45rem] text-pretty text-[12.5px] leading-5 text-muted">
          One realm, one issuer, one environment block. OAuth details stay
          inside Better Auth.
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
        <FormAlert>Could not load realm setup.</FormAlert>
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
          pending={pendingAction?.clientId === "new"}
          onCreate={create}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SetupStatus
          icon={<Check aria-hidden="true" size={15} />}
          label="User login"
          detail={app ? "Ready" : "Waiting for backend URL"}
          ready={Boolean(app && !app.disabled)}
        />
        <SetupStatus
          icon={<Waypoints aria-hidden="true" size={15} />}
          label="MCP discovery"
          detail={mcpReady ? "Ready automatically" : "Enabled with new keys"}
          ready={mcpReady}
        />
      </div>

      <details className="rounded-xl border border-border bg-surface-muted">
        <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-3 px-4 text-[12.5px] font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span className="flex items-center gap-2">
            <KeyRound aria-hidden="true" size={15} />
            Backend API keys
          </span>
          <Pill>{apiKeys.length}</Pill>
        </summary>
        <div className="space-y-4 border-t border-border p-4">
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
            <h3 className="text-[14px] font-semibold text-ink">Ready to use</h3>
            <StatusBadge
              tone={app.disabled ? "neutral" : "success"}
              label={app.disabled ? "Paused" : "Active"}
            />
          </div>
          <p className="mt-1 text-[11.5px] leading-5 text-muted">
            The app backend signs users in through this realm.
          </p>
        </div>
        <div className="flex gap-2">
          {app.disabled ? (
            <Button type="button" size="sm" loading={pending} onClick={onEnable}>
              Resume
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            leading={<RotateCcw aria-hidden="true" size={13} />}
            disabled={pending}
            onClick={onConfirmRotate}
          >
            New keys
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SetupValue label="Issuer" value={issuer} />
        <SetupValue label="Client ID" value={app.clientId} />
      </div>

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
              Generate new keys
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

function SetupStatus({
  icon,
  label,
  detail,
  ready
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
      <span className={ready ? "text-success" : "text-muted"}>{icon}</span>
      <div>
        <div className="text-[12px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] text-muted">{detail}</div>
      </div>
    </div>
  );
}
