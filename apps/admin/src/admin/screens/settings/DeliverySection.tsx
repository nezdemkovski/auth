import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Button,
  PrimaryButton,
  SelectField,
  SettingsInput
} from "@nezdemkovski/auth-ui";

import {
  fetchDeliverySettings,
  updateDeliverySettings,
  verifyDeliverySettings
} from "../../api";
import { notifyError, notifySuccess } from "../../toast";
import type {
  DeliveryProvider,
  DeliverySettings,
  DeliverySettingsPatch
} from "../../types";
import { DELIVERY_PROVIDER_OPTIONS, parseDeliveryProvider } from "./options";

export function DeliverySection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "delivery-settings"],
    queryFn: fetchDeliverySettings
  });
  const settings = query.data;
  const mutation = useMutation({
    mutationFn: updateDeliverySettings,
    onSuccess: async () => {
      notifySuccess("Delivery settings saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "delivery-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    },
    onError: (error) => {
      notifyError(
        "Could not save delivery settings",
        error instanceof Error ? error.message : undefined
      );
    }
  });
  const verifyMutation = useMutation({
    mutationFn: verifyDeliverySettings,
    onSuccess: () => notifySuccess("Test email sent"),
    onError: (error) => {
      notifyError(
        "Could not send test email",
        error instanceof Error ? error.message : undefined
      );
    }
  });

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow">03 — Delivery</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      {query.isError ? (
        <p className="text-[13px] text-danger">Could not load delivery settings.</p>
      ) : null}
      {settings ? (
        <DeliveryForm
          settings={settings}
          saving={mutation.isPending}
          verifying={verifyMutation.isPending}
          onSubmit={(patch) => mutation.mutate(patch)}
          onVerify={() => verifyMutation.mutate()}
        />
      ) : (
        <p className="text-[13px] text-muted">Loading delivery settings…</p>
      )}
    </section>
  );
}

function DeliveryForm({
  settings,
  saving,
  verifying,
  onSubmit,
  onVerify
}: {
  settings: DeliverySettings;
  saving: boolean;
  verifying: boolean;
  onSubmit: (patch: DeliverySettingsPatch) => void;
  onVerify: () => void;
}) {
  const [provider, setProvider] = useState<DeliveryProvider>(settings.provider);
  const [from, setFrom] = useState(settings.from);
  const [cloudflareAccountId, setCloudflareAccountId] = useState(
    settings.cloudflareAccountId
  );
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");

  useEffect(() => {
    setProvider(settings.provider);
    setFrom(settings.from);
    setCloudflareAccountId(settings.cloudflareAccountId);
    setCloudflareApiToken("");
    setResendApiKey("");
  }, [settings]);

  const dirty =
    provider !== settings.provider ||
    from.trim() !== settings.from ||
    cloudflareAccountId.trim() !== settings.cloudflareAccountId ||
    cloudflareApiToken.trim().length > 0 ||
    resendApiKey.trim().length > 0;
  const ready =
    provider === "none" ||
    (provider === "resend" &&
      from.trim().length > 0 &&
      (settings.resendApiKeyConfigured || resendApiKey.trim().length > 0)) ||
    (provider === "cloudflare" &&
      from.trim().length > 0 &&
      cloudflareAccountId.trim().length > 0 &&
      (settings.cloudflareApiTokenConfigured || cloudflareApiToken.trim().length > 0));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      provider,
      from,
      cloudflareAccountId,
      ...(cloudflareApiToken.trim() ? { cloudflareApiToken } : {}),
      ...(resendApiKey.trim() ? { resendApiKey } : {})
    });
  };

  return (
    <form onSubmit={submit} className="max-w-[560px] space-y-4">
      <SelectField
        label="Provider"
        value={provider}
        options={DELIVERY_PROVIDER_OPTIONS}
        onChange={(value) => setProvider(parseDeliveryProvider(value))}
      />

      {provider !== "none" ? (
        <SettingsInput
          id="delivery-from"
          label="From"
          value={from}
          onChange={setFrom}
          placeholder="Auth <auth@example.com>"
        />
      ) : null}

      {provider === "resend" ? (
        <SettingsInput
          id="delivery-resend-api-key"
          label={
            settings.resendApiKeyConfigured ? "Resend API key (configured)" : "Resend API key"
          }
          value={resendApiKey}
          onChange={setResendApiKey}
          type="password"
          autoComplete="off"
          placeholder={settings.resendApiKeyConfigured ? "Leave blank to keep current" : "re_..."}
        />
      ) : null}

      {provider === "cloudflare" ? (
        <>
          <SettingsInput
            id="delivery-cloudflare-account-id"
            label="Cloudflare account ID"
            value={cloudflareAccountId}
            onChange={setCloudflareAccountId}
            autoComplete="off"
            placeholder="Cloudflare account ID"
          />
          <SettingsInput
            id="delivery-cloudflare-api-token"
            label={
              settings.cloudflareApiTokenConfigured
                ? "Cloudflare API token (configured)"
                : "Cloudflare API token"
            }
            value={cloudflareApiToken}
            onChange={setCloudflareApiToken}
            type="password"
            autoComplete="off"
            placeholder={
              settings.cloudflareApiTokenConfigured
                ? "Leave blank to keep current"
                : "API token"
            }
          />
        </>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PrimaryButton type="submit" loading={saving} disabled={!dirty || !ready}>
          {saving ? "Saving…" : "Save delivery →"}
        </PrimaryButton>
        <Button
          type="button"
          onClick={onVerify}
          disabled={!settings.configured || verifying}
          loading={verifying}
          className="rounded-full px-5"
        >
          {verifying ? "Sending…" : "Send test email"}
        </Button>
      </div>
    </form>
  );
}
