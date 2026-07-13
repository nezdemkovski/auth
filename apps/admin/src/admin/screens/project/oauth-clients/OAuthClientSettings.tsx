import { useState } from "react";

import { EmptyState, FormAlert } from "@nezdemkovski/auth-ui";

import type {
  CreateOAuthClientInput,
  OAuthClient,
  OAuthClientCredential
} from "../../../types";
import { OAuthClientCard } from "./OAuthClientCard";
import { OAuthClientCreateForm } from "./OAuthClientCreateForm";
import {
  OAuthClientCredentialPanel,
  type VisibleOAuthClientCredential
} from "./OAuthClientCredentialPanel";
import type { ConfirmedAction, PendingAction } from "./model";
import { errorMessage } from "./model";

export function OAuthClientSettings({
  project,
  issuer,
  enabled,
  clients,
  loading,
  loadError,
  onCreate,
  onSetDisabled,
  onRotateSecret,
  onDelete
}: {
  project: string;
  issuer: string;
  enabled: boolean;
  clients: OAuthClient[];
  loading: boolean;
  loadError: boolean;
  onCreate: (input: CreateOAuthClientInput) => Promise<OAuthClientCredential>;
  onSetDisabled: (clientId: string, disabled: boolean) => Promise<void>;
  onRotateSecret: (clientId: string) => Promise<OAuthClientCredential>;
  onDelete: (clientId: string) => Promise<void>;
}) {
  const [credential, setCredential] =
    useState<VisibleOAuthClientCredential | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedAction | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const runCreate = async (
    input: CreateOAuthClientInput
  ): Promise<OAuthClientCredential> => {
    setError(null);
    try {
      return await onCreate(input);
    } catch (caught) {
      setError(errorMessage(caught, "Could not create OAuth client"));
      throw caught;
    }
  };

  const setDisabled = async (client: OAuthClient) => {
    setError(null);
    setPendingAction({ clientId: client.clientId, action: "toggle" });
    try {
      await onSetDisabled(client.clientId, !client.disabled);
    } catch (caught) {
      setError(errorMessage(caught, "Could not update OAuth client"));
    } finally {
      setPendingAction(null);
    }
  };

  const rotateSecret = async (client: OAuthClient) => {
    setError(null);
    setPendingAction({ clientId: client.clientId, action: "rotate" });
    try {
      const nextCredential = await onRotateSecret(client.clientId);
      setCredential({
        name: client.name,
        profile: client.profile,
        credential: nextCredential
      });
      setConfirmedAction(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not rotate client secret"));
    } finally {
      setPendingAction(null);
    }
  };

  const deleteClient = async (client: OAuthClient) => {
    setError(null);
    setPendingAction({ clientId: client.clientId, action: "delete" });
    try {
      await onDelete(client.clientId);
      setConfirmedAction(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not delete OAuth client"));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-6 p-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          OAuth clients
        </h2>
        <p className="mt-1 max-w-[45rem] text-[12.5px] leading-5 text-muted">
          Register product backends, native apps, and service workloads against this
          realm. Confidential secrets are returned once and are never shown again.
        </p>
      </div>

      {!enabled ? (
        <div className="rounded-xl border border-border bg-surface-muted p-4 text-[13px] leading-5 text-muted">
          Enable <strong className="font-semibold text-ink">OAuth provider</strong> in
          realm settings and save before creating clients.
        </div>
      ) : (
        <>
          {error ? <FormAlert>{error}</FormAlert> : null}

          {credential ? (
            <OAuthClientCredentialPanel
              issuer={issuer}
              visible={credential}
              onDismiss={() => setCredential(null)}
              onCopyError={(message) => setError(message)}
            />
          ) : null}

          <OAuthClientCreateForm
            project={project}
            pending={pendingAction?.clientId === "new"}
            onCreate={async (input) => {
              setPendingAction({ clientId: "new", action: "create" });
              try {
                const nextCredential = await runCreate(input);
                setCredential({
                  name: input.name,
                  profile: input.profile,
                  credential: nextCredential
                });
                return true;
              } catch {
                return false;
              } finally {
                setPendingAction(null);
              }
            }}
          />

          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h3 className="text-[13px] font-semibold text-ink">
                Registered clients
              </h3>
              <span className="text-[11.5px] text-muted">
                {clients.length} {clients.length === 1 ? "client" : "clients"}
              </span>
            </div>

            {loading ? (
              <div className="rounded-xl border border-border bg-surface-muted p-4 text-[13px] text-muted">
                Loading OAuth clients…
              </div>
            ) : loadError ? (
              <FormAlert>Could not load OAuth clients.</FormAlert>
            ) : clients.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface">
                <EmptyState
                  title="No OAuth clients"
                  description="Create a client above to connect a product or service."
                />
              </div>
            ) : (
              clients.map((client) => (
                <OAuthClientCard
                  key={client.clientId}
                  client={client}
                  pendingAction={pendingAction}
                  confirmedAction={confirmedAction}
                  onConfirm={setConfirmedAction}
                  onCancelConfirmation={() => setConfirmedAction(null)}
                  onSetDisabled={() => void setDisabled(client)}
                  onRotateSecret={() => void rotateSecret(client)}
                  onDelete={() => void deleteClient(client)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
