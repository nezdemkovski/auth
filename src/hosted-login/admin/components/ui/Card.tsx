import type React from "react";

export function Card({
  children,
  padding = true
}: {
  children: React.ReactNode;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface ${
        padding ? "" : "overflow-hidden"
      }`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </div>
  );
}
