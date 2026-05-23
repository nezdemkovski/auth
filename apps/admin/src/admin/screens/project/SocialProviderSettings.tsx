import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.provider, provider])),
    [providers]
  );
  const availableCatalog = catalog.filter((item) => providersById.has(item.id));
  const [selectedProvider, setSelectedProvider] = useState<SocialProviderId | null>(
    () => availableCatalog[0]?.id ?? null
  );

  useEffect(() => {
    if (!selectedProvider || !providersById.has(selectedProvider)) {
      setSelectedProvider(availableCatalog[0]?.id ?? null);
    }
  }, [availableCatalog, providersById, selectedProvider]);

  const selectedCatalogItem = availableCatalog.find(
    (item) => item.id === selectedProvider
  );
  const selectedSettings = selectedProvider
    ? providersById.get(selectedProvider) ?? null
    : null;

  return (
    <div className="space-y-5 p-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Social sign-in
        </h2>
        <p className="mt-1 max-w-[38rem] text-[12.5px] leading-5 text-muted">
          Enable external login providers one at a time. Secrets stay encrypted
          and are never returned to the browser.
        </p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="mb-3 text-[13px] font-semibold text-ink">Providers</div>
          <div className="space-y-2">
            {availableCatalog.map((item) => {
              const provider = providersById.get(item.id);
              if (!provider) return null;
              const Icon = providerIcons[item.id];
              const selected = selectedProvider === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedProvider(item.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    selected
                      ? "border-border-strong bg-accent-soft"
                      : "border-border bg-surface-muted hover:bg-surface-hover"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-ink">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">
                        {provider.enabled ? "Enabled" : "Disabled"}
                        {provider.configured ? " · Configured" : ""}
                      </span>
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        provider.enabled ? "bg-success" : "bg-muted-soft"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-border bg-surface p-4">
          {selectedCatalogItem && selectedSettings ? (
            <SocialProviderEditor
              key={selectedCatalogItem.id}
              item={selectedCatalogItem}
              provider={selectedSettings}
              disabled={disabled}
              pending={pendingProvider === selectedCatalogItem.id}
              verifyPending={verifyPendingProvider === selectedCatalogItem.id}
              onSave={onSave}
              onVerify={onVerify}
            />
          ) : (
            <div className="py-12 text-center text-[13px] text-muted">
              Select a provider to configure sign-in.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SocialProviderEditor({
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
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-ink">
            <Icon size={20} />
          </span>
          <span className="min-w-0">
            <span className="eyebrow">Provider</span>
            <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
              {item.label}
            </h3>
            <span className="mt-1 block break-all text-[12px] leading-5 text-muted">
              {provider.callbackUrl}
            </span>
          </span>
        </div>
        <TogglePill
          checked={enabled}
          disabled={disabled || pending}
          onChange={setEnabled}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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

      <div className="rounded-xl border border-border bg-surface-muted p-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          Status
        </div>
        <div className="mt-2 text-[12.5px] leading-5 text-ink-soft">
          {provider.verifiedAt ? (
            <span>Verified {new Date(provider.verifiedAt).toLocaleString()}</span>
          ) : provider.configured ? (
            <span>Configured, not checked yet</span>
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
      </div>

      <div className="flex flex-wrap justify-end gap-2">
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
    </form>
  );
}

function TogglePill({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="sr-only"
      />
      <span
        className={`relative h-6 w-10 rounded-full border border-border transition-colors ${
          checked ? "bg-accent" : "bg-surface-muted"
        } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full transition-transform ${
            checked ? "translate-x-4 bg-accent-ink" : "bg-muted-soft"
          }`}
        />
      </span>
      {checked ? "On" : "Off"}
    </label>
  );
}
