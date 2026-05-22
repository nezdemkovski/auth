import type React from "react";

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
  const isDisabled = loading || disabled;
  return (
    <button
      type={type}
      disabled={isDisabled}
      data-press
      className={`mt-1 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-[14px] font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
        loading ? "cursor-wait opacity-75" : "disabled:cursor-not-allowed disabled:opacity-50"
      }`}
      style={{
        boxShadow: "var(--shadow-button)",
        transition: "background-color 140ms ease, transform 120ms"
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) e.currentTarget.style.background = "var(--accent-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--accent)";
      }}
    >
      {children}
    </button>
  );
}
