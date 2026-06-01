import type React from "react";

import { Button } from "./Button";

export function PrimaryButton({
  children,
  type = "button",
  loading = false,
  disabled = false
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type={type}
      variant="primary"
      fullWidth
      loading={loading}
      disabled={disabled}
      className="mt-1"
    >
      {children}
    </Button>
  );
}
