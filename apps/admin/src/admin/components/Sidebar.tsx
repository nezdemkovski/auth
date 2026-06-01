import type React from "react";
import { KeyRound } from "lucide-react";

import type { ProjectSummary } from "../types";
import { pad2 } from "../utils/format";

export function Sidebar({
  projects,
  loading,
  selectedSlug,
  onSelect
}: {
  projects: ProjectSummary[];
  loading: boolean;
  selectedSlug: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <aside className="backdrop-saturate sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-border bg-surface-muted/40 lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5 text-ink">
        <KeyRound size={20} strokeWidth={1.8} />
        <div className="leading-tight">
          <div className="text-[13.5px] font-semibold tracking-[-0.01em]">
            Auth
          </div>
          <div className="mono text-[10px] uppercase tracking-[0.08em] text-muted">
            Nezdemkovski Cloud
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
        <SidebarSection label="Workspace">
          <SidebarNavItem
            label="Overview"
            active={selectedSlug === "__overview__"}
            onClick={() => onSelect("__overview__")}
          />
        </SidebarSection>

        <SidebarSection label="Realms" count={projects.length}>
          {loading ? (
            <div className="space-y-1 pl-4 pr-2">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-7 animate-pulse rounded bg-surface-hover"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="px-4 py-1.5 text-[12px] text-muted-soft">
              No realms yet.
            </div>
          ) : (
            <ul className="space-y-px">
              {projects.map((project, idx) => (
                <SidebarProjectItem
                  key={project.slug}
                  index={idx + 1}
                  project={project}
                  active={selectedSlug === project.slug}
                  onClick={() => onSelect(project.slug)}
                />
              ))}
            </ul>
          )}
        </SidebarSection>
      </nav>

      <div className="px-5 pb-5">
        <a
          href="https://github.com/nezdemkovski/auth"
          target="_blank"
          rel="noreferrer"
          className="mono inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-soft transition-colors hover:text-ink"
        >
          ↗ Source
        </a>
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  count,
  children
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="mb-2 flex items-baseline justify-between px-4">
        <span className="mono text-[10px] uppercase tracking-[0.1em] text-muted-soft">
          {label}
        </span>
        {count !== undefined ? (
          <span className="mono tabular text-[10px] tracking-[0.04em] text-muted-soft">
            {pad2(count)}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SidebarNavItem({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-press
      className={`relative flex h-8 w-full items-center px-4 text-left text-[13.5px] outline-none transition-colors ${
        active ? "text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[2px] rounded-full bg-accent"
        />
      ) : null}
      <span className={active ? "font-medium" : ""}>{label}</span>
    </button>
  );
}

function SidebarProjectItem({
  index,
  project,
  active,
  onClick
}: {
  index: number;
  project: ProjectSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-press
        className={`group relative flex h-8 w-full items-baseline gap-3 px-4 text-left outline-none transition-colors`}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[2px] rounded-full bg-accent"
          />
        ) : null}
        <span
          className={`mono tabular w-5 shrink-0 text-[10.5px] tracking-[0.04em] ${
            active ? "text-ink" : "text-muted-soft"
          }`}
        >
          {pad2(index)}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            active ? "font-medium text-ink" : "text-muted group-hover:text-ink"
          }`}
        >
          {project.name}
        </span>
        {project.system ? (
          <span
            className="mono shrink-0 text-[9px] uppercase tracking-[0.1em] text-muted-soft"
            title="System project"
          >
            sys
          </span>
        ) : null}
      </button>
    </li>
  );
}
