import { useState } from "react";

import { EmptyState, FormAlert } from "@nezdemkovski/auth-ui";

import type {
  AuthConnection,
  AuthConnectionCredential,
  AuthConnectionsResponse,
  CreateAuthConnectionInput
} from "../../../types";
import { AuthConnectionCard } from "./AuthConnectionCard";
import { AuthConnectionCreate } from "./AuthConnectionCreate";
import {
  AuthConnectionCredentialPanel,
  type VisibleAuthConnectionCredential
} from "./AuthConnectionCredentialPanel";
import type { ConfirmedAction, PendingAction } from "./model";
import { errorMessage } from "./model";

export function AuthConnectionSettings({
  project,
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
      setError(errorMessage(caught, "Could not create connection"));
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
      setError(errorMessage(caught, "Could not update connection"));
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
      setError(errorMessage(caught, "Could not rotate credential"));
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
      setError(errorMessage(caught, "Could not delete connection"));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-6 p-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Connections
        </h2>
        <p className="mt-1 max-w-[45rem] text-pretty text-[12.5px] leading-5 text-muted">
          Connect an app or trusted backend to this realm. Choose what needs
          access; the secure protocol details are configured for you.
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
          Loading connections…
        </div>
      ) : loadError ? (
        <FormAlert>Could not load connections.</FormAlert>
      ) : (
        <>
          <AuthConnectionCreate
            project={project}
            permissions={permissionCatalog}
            pending={pendingAction?.clientId === "new"}
            onCreate={create}
          />

          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h3 className="text-[13px] font-semibold text-ink">Connected</h3>
              <span className="text-[11.5px] text-muted">
                {connections.length} {connections.length === 1 ? "connection" : "connections"}
              </span>
            </div>

            {connections.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface">
                <EmptyState
                  title="Nothing connected yet"
                  description="Choose one of the two jobs above to get started."
                />
              </div>
            ) : (
              connections.map((connection) => (
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
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
