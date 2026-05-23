import type React from "react";

import { ShieldIcon } from "@nezdemkovski/auth-client-shared/icons";

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-dashed border-border-strong text-muted-soft"
      >
        <ShieldIcon size={16} />
      </span>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[28rem] text-[13px] leading-[1.55] text-muted">
        {description}
      </p>
    </div>
  );
}
