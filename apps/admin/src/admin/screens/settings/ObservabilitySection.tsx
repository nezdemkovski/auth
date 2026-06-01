import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Button,
  PrimaryButton,
  SelectField,
  SettingsInput,
  Switch
} from "@nezdemkovski/auth-ui";

import {
  fetchObservabilitySettings,
  sendObservabilityTestEvent,
  updateObservabilitySettings
} from "../../api";
import { notifyError, notifySuccess } from "../../toast";
import type {
  ObservabilityProvider,
  ObservabilitySettings,
  ObservabilitySettingsPatch
} from "../../types";
import {
  OBSERVABILITY_PROVIDER_OPTIONS,
  parseObservabilityProvider
} from "./options";

export function ObservabilitySection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "observability-settings"],
    queryFn: fetchObservabilitySettings
  });
  const settings = query.data;
  const mutation = useMutation({
    mutationFn: updateObservabilitySettings,
    onSuccess: async () => {
      notifySuccess("Observability settings saved");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "observability-settings"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "observability-config"]
      });
    },
    onError: (error) => {
      notifyError(
        "Could not save observability settings",
        error instanceof Error ? error.message : undefined
      );
    }
  });
  const testMutation = useMutation({
    mutationFn: sendObservabilityTestEvent,
    onSuccess: () => notifySuccess("Sentry test event sent"),
    onError: (error) => {
      notifyError(
        "Could not send test event",
        error instanceof Error ? error.message : undefined
      );
    }
  });

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow">04 — Observability</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      {query.isError ? (
        <p className="text-[13px] text-danger">
          Could not load observability settings.
        </p>
      ) : null}
      {settings ? (
        <ObservabilityForm
          settings={settings}
          saving={mutation.isPending}
          testing={testMutation.isPending}
          onSubmit={(patch) => mutation.mutate(patch)}
          onTest={() => testMutation.mutate()}
        />
      ) : (
        <p className="text-[13px] text-muted">Loading observability settings…</p>
      )}
    </section>
  );
}

function ObservabilityForm({
  settings,
  saving,
  testing,
  onSubmit,
  onTest
}: {
  settings: ObservabilitySettings;
  saving: boolean;
  testing: boolean;
  onSubmit: (patch: ObservabilitySettingsPatch) => void;
  onTest: () => void;
}) {
  const [provider, setProvider] = useState<ObservabilityProvider>(settings.provider);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [environment, setEnvironment] = useState(settings.environment);
  const [dsn, setDsn] = useState("");

  useEffect(() => {
    setProvider(settings.provider);
    setEnabled(settings.enabled);
    setEnvironment(settings.environment);
    setDsn("");
  }, [settings]);

  const dirty =
    provider !== settings.provider ||
    enabled !== settings.enabled ||
    environment.trim() !== settings.environment ||
    dsn.trim().length > 0;
  const ready =
    provider === "none" ||
    !enabled ||
    (environment.trim().length > 0 &&
      (settings.dsnConfigured || dsn.trim().length > 0));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      provider,
      enabled,
      environment: environment.trim() || "production",
      ...(dsn.trim() ? { dsn: dsn.trim() } : {})
    });
  };

  return (
    <form onSubmit={submit} className="max-w-[560px] space-y-4">
      <SelectField
        label="Provider"
        value={provider}
        options={OBSERVABILITY_PROVIDER_OPTIONS}
        onChange={(value) => {
          const next = parseObservabilityProvider(value);
          setProvider(next);
          setEnabled(next === "sentry");
        }}
      />

      {provider === "sentry" ? (
        <>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3">
            <Switch checked={enabled} onChange={setEnabled} />
            <span>
              <span className="block text-[13px] font-semibold text-ink">
                Capture platform errors
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-muted">
                API, admin UI, and login UI events use one DSN with component and
                realm tags.
              </span>
            </span>
          </label>

          <SettingsInput
            id="observability-sentry-dsn"
            label={settings.dsnConfigured ? "Sentry DSN (configured)" : "Sentry DSN"}
            value={dsn}
            onChange={setDsn}
            type="password"
            autoComplete="off"
            placeholder={settings.dsnConfigured ? "Leave blank to keep current" : "https://..."}
          />
          <SettingsInput
            id="observability-environment"
            label="Environment"
            value={environment}
            onChange={setEnvironment}
            placeholder="production"
          />
        </>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PrimaryButton type="submit" loading={saving} disabled={!dirty || !ready}>
          {saving ? "Saving…" : "Save observability →"}
        </PrimaryButton>
        <Button
          type="button"
          onClick={onTest}
          disabled={!settings.configured || testing}
          loading={testing}
          className="rounded-full px-5"
        >
          {testing ? "Sending…" : "Send test event"}
        </Button>
      </div>
    </form>
  );
}
