import { useEffect, useState } from "react";

import type { ProjectSummary } from "../types";
import { formatRelative } from "../utils/format";

function useRelativeNow(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

export function Topbar({
  selected,
  syncedAt
}: {
  selected: ProjectSummary | undefined;
  syncedAt: number;
}) {
  useRelativeNow();
  const seconds = Math.max(0, Math.floor((Date.now() - syncedAt) / 1000));
  return (
    <header
      className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-bg/85 px-6 lg:px-10"
      style={{ backdropFilter: "saturate(180%) blur(8px)" }}
    >
      <nav
        aria-label="Breadcrumb"
        className="mono flex items-center text-[12px] uppercase tracking-[0.06em] text-muted"
      >
        <span className="text-muted-soft">/</span>
        <span className="text-muted">nezdemkovski</span>
        <span className="text-muted-soft">/</span>
        <span className="text-ink">
          {selected ? selected.slug : "overview"}
        </span>
      </nav>

      <div
        className="mono hidden items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted sm:flex"
        title={`Last synced ${new Date(syncedAt).toLocaleTimeString()}`}
      >
        <span>Synced {formatRelative(seconds)}</span>
      </div>
    </header>
  );
}
