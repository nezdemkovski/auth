import { Button } from "@nezdemkovski/auth-ui";

import { ActionButton } from "./shared";

export function PasskeyEnrollStep({
  pending,
  onAdd,
  onSkip
}: {
  pending: boolean;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="enter enter-1 mt-8 space-y-3">
      <ActionButton type="button" disabled={pending} onClick={onAdd}>
        {pending ? "Waiting…" : "Add passkey"}
      </ActionButton>
      <Button
        type="button"
        disabled={pending}
        onClick={onSkip}
        variant="link"
        fullWidth
        className="text-[13px]"
      >
        Continue without passkey
      </Button>
    </div>
  );
}
