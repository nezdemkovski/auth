import type React from "react";
import { Button } from "react-aria-components";

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
      isDisabled={loading || disabled}
      className={`mt-1 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-[14px] font-medium text-accent-ink outline-none transition-[background-color,transform,opacity] duration-150 hover:bg-accent-hover data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--focus-ring)] data-[pressed]:scale-[0.97] ${
        loading
          ? "cursor-wait opacity-75"
          : "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-accent"
      }`}
      style={{ boxShadow: "var(--shadow-button)" }}
    >
      {children}
    </Button>
  );
}
