import type { FormEvent } from "react";

import { Button } from "@nezdemkovski/auth-ui";

import { ActionButton, FormField, InfoPanel } from "./shared";

export function TwoFactorStep({
  pending,
  code,
  onCodeChange,
  onBack,
  onSubmit
}: {
  pending: boolean;
  code: string;
  onCodeChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <FormField
        id="two-factor-code"
        name="code"
        label="Verification code"
        type="text"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={onCodeChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify and continue ↗"}
      </ActionButton>
      <Button
        type="button"
        disabled={pending}
        onClick={onBack}
        variant="link"
        fullWidth
        className="text-[13px]"
      >
        Back to password sign-in
      </Button>
    </form>
  );
}

export function TwoFactorEnrollStep({
  pending,
  totpUri,
  backupCodes,
  code,
  onCodeChange,
  onStart,
  onSubmit
}: {
  pending: boolean;
  totpUri: string;
  backupCodes: string[];
  code: string;
  onCodeChange: (value: string) => void;
  onStart: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!totpUri) {
    return (
      <div className="enter enter-1 mt-8 space-y-3">
        <InfoPanel>
          This realm requires two-factor authentication. Set up an authenticator
          app to continue.
        </InfoPanel>
        <ActionButton type="button" disabled={pending} onClick={onStart}>
          {pending ? "Preparing…" : "Set up authenticator ↗"}
        </ActionButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <p className="text-[12.5px] leading-5 text-muted">
          Add this setup key in your authenticator app, then enter the code it
          generates.
        </p>
        <textarea
          readOnly
          value={totpUri}
          rows={4}
          className="mt-3 w-full resize-none rounded-lg border border-border bg-surface p-2 font-mono text-[11px] leading-5 text-ink outline-none"
        />
      </div>

      {backupCodes.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-[12.5px] leading-5 text-muted">
            Save these backup codes before continuing.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-ink">
            {backupCodes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
        </div>
      ) : null}

      <FormField
        id="two-factor-enroll-code"
        name="code"
        label="Verification code"
        type="text"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={onCodeChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Enable and continue ↗"}
      </ActionButton>
    </form>
  );
}
