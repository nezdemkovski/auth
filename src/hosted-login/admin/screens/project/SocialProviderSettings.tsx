import type React from "react";
import { useEffect, useState } from "react";
import {
  SiFacebook,
  SiGithub,
  SiGoogle,
  SiX
} from "@icons-pack/react-simple-icons";

import type {
  PublicSocialProviderSettings,
  SocialProviderCatalogItem,
  SocialProviderId,
  SocialProviderPatch
} from "../../types";
import { FormAlert, SettingsInput } from "../../components/primitives";

const providerIcons: Record<SocialProviderId, React.ComponentType<{ size?: number }>> = {
  github: SiGithub,
  google: SiGoogle,
  twitter: SiX,
  facebook: SiFacebook
};

export function SocialProviderSettings({
  providers,
  catalog,
  disabled,
  pendingProvider,
  verifyPendingProvider,
  error,
  onSave,
  onVerify
}: {
  providers: PublicSocialProviderSettings[];
  catalog: SocialProviderCatalogItem[];
  disabled: boolean;
  pendingProvider: SocialProviderId | null;
  verifyPendingProvider: SocialProviderId | null;
  error: string | null;
  onSave: (provider: SocialProviderId, patch: SocialProviderPatch) => void;
  onVerify: (provider: SocialProviderId) => void;
}) {
  const providersById = new Map(providers.map((provider) => [provider.provider, provider]));

  return (
    <div className="space-y-5 p-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Social sign-in
        </h2>
        <p className="mt-1 max-w-[38rem] text-[12.5px] leading-5 text-muted">
          Configure external identity providers for this realm. Secrets are stored
          encrypted and are never returned to the browser.
        </p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="grid gap-3">
        {catalog.map((item) => {
          const provider = providersById.get(item.id);
          if (!provider) return null;

          return (
            <SocialProviderCard
              key={item.id}
              item={item}
              provider={provider}
              disabled={disabled}
              pending={pendingProvider === item.id}
              verifyPending={verifyPendingProvider === item.id}
              onSave={onSave}
              onVerify={onVerify}
            />
          );
        })}
      </div>
    </div>
  );
}

function SocialProviderCard({
  item,
  provider,
  disabled,
  pending,
  verifyPending,
  onSave,
  onVerify
}: {
  item: SocialProviderCatalogItem;
  provider: PublicSocialProviderSettings;
  disabled: boolean;
  pending: boolean;
  verifyPending: boolean;
  onSave: (provider: SocialProviderId, patch: SocialProviderPatch) => void;
  onVerify: (provider: SocialProviderId) => void;
}) {
  const [enabled, setEnabled] = useState(provider.enabled);
  const [clientId, setClientId] = useState(provider.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const Icon = providerIcons[item.id];

  useEffect(() => {
    setEnabled(provider.enabled);
    setClientId(provider.clientId);
    setClientSecret("");
  }, [provider]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(item.id, {
      enabled,
      clientId,
      ...(clientSecret.trim() ? { clientSecret } : {})
    });
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-ink">
            <Icon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-ink">
              {item.label}
            </span>
            <span className="mt-0.5 block break-all text-[11.5px] leading-5 text-muted">
              {provider.callbackUrl}
            </span>
          </span>
        </div>

        <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled || pending}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
            className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SettingsInput
          id={`${item.id}-client-id`}
          label={item.clientIdLabel}
          value={clientId}
          disabled={disabled || pending}
          onChange={setClientId}
        />
        <SettingsInput
          id={`${item.id}-client-secret`}
          label={item.clientSecretLabel}
          value={clientSecret}
          type="password"
          disabled={disabled || pending}
          placeholder={provider.configured ? "Stored encrypted" : ""}
          onChange={setClientSecret}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] leading-5 text-muted">
          {provider.verifiedAt ? (
            <span>Last checked {new Date(provider.verifiedAt).toLocaleString()}</span>
          ) : provider.configured ? (
            <span>Saved, not checked yet</span>
          ) : (
            <span>Not configured</span>
          )}
          {" · "}
          <a
            href={item.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink underline-offset-[3px] hover:underline"
          >
            Setup docs
          </a>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-press
            disabled={disabled || verifyPending || !provider.configured || !enabled}
            onClick={() => onVerify(item.id)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {verifyPending ? "Checking…" : "Check"}
          </button>
          <button
            type="submit"
            data-press
            disabled={disabled || pending}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-ink outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
            style={{ boxShadow: "var(--shadow-button)" }}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
