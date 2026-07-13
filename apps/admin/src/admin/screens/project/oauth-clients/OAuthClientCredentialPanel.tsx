import { useState } from "react";

import { Button, Pill } from "@nezdemkovski/auth-ui";

import type {
  OAuthClientCredential,
  OAuthClientProfile
} from "../../../types";
import { buildOAuthClientEnvironment } from "./environment";

export type VisibleOAuthClientCredential = {
  name: string;
  profile: OAuthClientProfile;
  credential: OAuthClientCredential;
};

export function OAuthClientCredentialPanel({
  issuer,
  visible,
  onDismiss,
  onCopyError
}: {
  issuer: string;
  visible: VisibleOAuthClientCredential;
  onDismiss: () => void;
  onCopyError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const environment = buildOAuthClientEnvironment({
    issuer,
    profile: visible.profile,
    credential: visible.credential
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(environment);
      setCopied(true);
    } catch {
      onCopyError("Could not copy credentials to the clipboard");
    }
  };

  return (
    <div
      role="status"
      className="rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">
            Credentials for {visible.name}
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-soft">
            Save this block now. A confidential client secret cannot be viewed again.
          </p>
        </div>
        <Pill>shown once</Pill>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-[12px] leading-5 text-ink">
        {environment}
      </pre>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy env"}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={onDismiss}>
          I saved it
        </Button>
      </div>
    </div>
  );
}
