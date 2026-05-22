import type React from "react";

export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-5"
      style={{
        background: "var(--danger-bg)",
        borderColor: "var(--danger-border)",
        color: "var(--danger)"
      }}
    >
      <span
        aria-hidden="true"
        className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--danger)" }}
      />
      <span>{children}</span>
    </div>
  );
}
