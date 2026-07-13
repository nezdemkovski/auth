import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button, Pill } from "@nezdemkovski/auth-ui";

import type {
  AuthConnectionCredential,
  AuthConnectionKind
} from "../../../types";
import { buildAuthConnectionEnvironment } from "./environment";

export type VisibleAuthConnectionCredential = {
  name: string;
  kind: AuthConnectionKind;
  credential: AuthConnectionCredential;
};

export function AuthConnectionCredentialPanel({
  issuer,
  visible,
  onDismiss,
  onCopyError
}: {
  issuer: string;
  visible: VisibleAuthConnectionCredential;
  onDismiss: () => void;
  onCopyError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const environment = buildAuthConnectionEnvironment({
    issuer,
    kind: visible.kind,
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
            {visible.name} is ready
          </div>
          <p className="mt-1 text-pretty text-[12.5px] leading-5 text-ink-soft">
            Add these values to your app's private environment now. The secret is
            shown only once.
          </p>
        </div>
        <Pill>shown once</Pill>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-[12px] leading-5 text-ink">
        {environment}
      </pre>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          leading={
            copied ? (
              <Check aria-hidden="true" size={14} />
            ) : (
              <Copy aria-hidden="true" size={14} />
            )
          }
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy env"}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={onDismiss}>
          I saved it
        </Button>
      </div>
    </div>
  );
}
