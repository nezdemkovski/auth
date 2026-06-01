import type { FormEvent } from "react";

import { Button } from "@nezdemkovski/auth-ui";

import { ActionButton, FormField } from "./shared";

export function ForgotPasswordStep({
  pending,
  email,
  onEmailChange,
  onBack,
  onSubmit
}: {
  pending: boolean;
  email: string;
  onEmailChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="enter enter-1 mt-8 space-y-4">
      <FormField
        id="reset-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={onEmailChange}
      />
      <ActionButton type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link ↗"}
      </ActionButton>
      <Button
        type="button"
        disabled={pending}
        onClick={onBack}
        variant="link"
        fullWidth
        className="text-[13px]"
      >
        Back to sign in
      </Button>
    </form>
  );
}
