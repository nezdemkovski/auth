import type React from "react";
import { useState } from "react";

import {
  Button,
  SelectField,
  SettingsInput,
  SettingsTextarea,
  Switch
} from "@nezdemkovski/auth-ui";

import {
  OAuthClientProfile,
  type CreateOAuthClientInput
} from "../../../types";
import {
  DEFAULT_LOGIN_SCOPES,
  DEFAULT_SERVICE_SCOPES,
  PROFILE_OPTIONS,
  parseProfile,
  splitLines
} from "./model";

export function OAuthClientCreateForm({
  project,
  pending,
  onCreate
}: {
  project: string;
  pending: boolean;
  onCreate: (input: CreateOAuthClientInput) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(OAuthClientProfile.Web);
  const [redirectUris, setRedirectUris] = useState("");
  const [postLogoutRedirectUris, setPostLogoutRedirectUris] = useState("");
  const [scopes, setScopes] = useState(DEFAULT_LOGIN_SCOPES);
  const [resources, setResources] = useState("");
  const [skipConsent, setSkipConsent] = useState(true);

  const requiresRedirect = profile !== OAuthClientProfile.Service;
  const ready =
    name.trim().length > 0 &&
    splitLines(scopes).length > 0 &&
    (!requiresRedirect || splitLines(redirectUris).length > 0);

  const changeProfile = (value: string) => {
    const nextProfile = parseProfile(value);
    setProfile(nextProfile);
    setScopes(
      nextProfile === OAuthClientProfile.Service
        ? DEFAULT_SERVICE_SCOPES
        : DEFAULT_LOGIN_SCOPES
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) {
      return;
    }
    const created = await onCreate({
      name: name.trim(),
      profile,
      redirectUris:
        profile === OAuthClientProfile.Service ? [] : splitLines(redirectUris),
      postLogoutRedirectUris:
        profile === OAuthClientProfile.Service
          ? []
          : splitLines(postLogoutRedirectUris),
      scopes: splitLines(scopes),
      resources: splitLines(resources),
      skipConsent
    });
    if (created) {
      setName("");
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-5 rounded-xl border border-border bg-surface-muted p-4"
    >
      <div>
        <span className="eyebrow">New client</span>
        <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          Connect a product or service
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SettingsInput
          id={`${project}-oauth-client-name`}
          label="Client name"
          value={name}
          disabled={pending}
          placeholder="Demo product backend"
          onChange={setName}
        />
        <SelectField
          id={`${project}-oauth-client-profile`}
          label="Client profile"
          value={profile}
          disabled={pending}
          options={PROFILE_OPTIONS}
          onChange={changeProfile}
        />
      </div>

      {requiresRedirect ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SettingsTextarea
            id={`${project}-oauth-client-redirects`}
            label="Redirect URIs — one per line"
            value={redirectUris}
            disabled={pending}
            rows={3}
            placeholder="https://api.example.com/api/auth/oauth2/callback/auth-platform"
            onChange={setRedirectUris}
          />
          <SettingsTextarea
            id={`${project}-oauth-client-post-logout-redirects`}
            label="Post-logout redirect URIs — one per line"
            value={postLogoutRedirectUris}
            disabled={pending}
            rows={3}
            placeholder="https://app.example.com"
            onChange={setPostLogoutRedirectUris}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsTextarea
          id={`${project}-oauth-client-scopes`}
          label="Scopes — one per line"
          value={scopes}
          disabled={pending}
          rows={4}
          onChange={setScopes}
        />
        <SettingsTextarea
          id={`${project}-oauth-client-resources`}
          label="Resources — one URI per line"
          value={resources}
          disabled={pending}
          rows={4}
          placeholder="https://auth.example.com/api/demo/billing"
          onChange={setResources}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2.5">
        <div>
          <div className="text-[12.5px] font-medium text-ink">Skip consent</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            Use for first-party clients owned by this realm.
          </div>
        </div>
        <Switch checked={skipConsent} disabled={pending} onChange={setSkipConsent} />
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={!ready}
        >
          {pending ? "Creating…" : "Create client"}
        </Button>
      </div>
    </form>
  );
}
