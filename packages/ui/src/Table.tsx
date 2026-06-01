import type React from "react";

import { cn } from "./cn";

const ALIGNMENT_CLASSES = {
  left: "text-left",
  right: "text-right"
};

export function Th({
  children,
  align = "left"
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-soft",
        ALIGNMENT_CLASSES[align]
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left"
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-5 py-3 align-middle",
        ALIGNMENT_CLASSES[align]
      )}
    >
      {children}
    </td>
  );
}
