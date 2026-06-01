import type React from "react";

import { cn } from "./cn";

const CARD_OVERFLOW = {
  default: "",
  clipped: "overflow-hidden"
};

const cardOverflow = (padding: boolean) => {
  if (padding) return "default";
  return "clipped";
};

export function Card({
  children,
  padding = true
}: {
  children: React.ReactNode;
  padding?: boolean;
}) {
  const overflow = cardOverflow(padding);

  return (
    <div
      className={cn(
        "shadow-card rounded-xl border border-border bg-surface",
        CARD_OVERFLOW[overflow]
      )}
    >
      {children}
    </div>
  );
}
