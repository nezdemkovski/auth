import type React from "react";

import { BrandMark, HomeIcon, SignOutIcon } from "../../icons";
import type { Theme } from "../../theme";
import type { MeResponse, ProjectSummary } from "../types";
import { pad2 } from "../utils/format";
import { Avatar, ProjectGlyph, ThemeToggle } from "./primitives";

export function Sidebar({
  me,
  projects,
  loading,
  selectedSlug,
  onSelect,
  onSignOut,
  theme,
  onToggleTheme
}: {
  me: MeResponse;
  projects: ProjectSummary[];
  loading: boolean;
  selectedSlug: string;
  onSelect: (slug: string) => void;
  onSignOut: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-border bg-surface-muted/40 lg:flex"
      style={{ backdropFilter: "saturate(180%)" }}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5 text-ink">
        <BrandMark size={20} />
        <div className="leading-tight">
          <div className="text-[13.5px] font-semibold tracking-[-0.01em]">
            Auth
          </div>
          <div className="text-[11px] text-muted">Nezdemkovski Cloud</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarSection label="Workspace">
          <SidebarLink
            icon={<HomeIcon size={14} />}
            label="Overview"
            active={selectedSlug === "__overview__"}
            onClick={() => onSelect("__overview__")}
          />
        </SidebarSection>

        <SidebarSection label="Projects" count={projects.length}>
          {loading ? (
            <div className="space-y-1.5 px-2 py-1">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-9 animate-pulse rounded-md bg-surface-hover"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-1.5 text-[12.5px] text-muted">
              No projects configured.
            </div>
          ) : (
            projects.map((project) => (
              <SidebarProjectItem
                key={project.slug}
                project={project}
                active={selectedSlug === project.slug}
                onClick={() => onSelect(project.slug)}
              />
            ))
          )}
        </SidebarSection>
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar email={me.user.email} size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium text-ink">
              {me.user.name || me.user.email.split("@")[0]}
            </div>
            <div className="truncate text-[11.5px] text-muted">{me.user.email}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
          <button
            type="button"
            onClick={onSignOut}
            data-press
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <SignOutIcon size={13} />
            Sign out
          </button>
        </div>
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
    <div className="mb-5">
      <div className="mb-1.5 flex items-center justify-between px-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-soft">
          {label}
        </span>
        {count !== undefined ? (
          <span className="tabular text-[11px] text-muted-soft">{count}</span>
        ) : null}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-press
      className={`group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium outline-none transition-colors ${
        active
          ? "bg-surface text-ink"
          : "text-muted hover:bg-surface-hover hover:text-ink"
      }`}
      style={active ? { boxShadow: "var(--shadow-card)" } : undefined}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center ${
          active ? "text-ink" : "text-muted-soft group-hover:text-ink"
        }`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function SidebarProjectItem({
  project,
  active,
  onClick
}: {
  project: ProjectSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-press
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors ${
        active ? "bg-surface" : "hover:bg-surface-hover"
      }`}
      style={active ? { boxShadow: "var(--shadow-card)" } : undefined}
    >
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[11px] font-semibold tracking-[-0.01em] ${
          active
            ? "bg-accent text-accent-ink"
            : "border border-border bg-surface text-ink-soft"
        }`}
      >
        <ProjectGlyph project={project} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-[12.5px] font-medium ${
              active ? "text-ink" : "text-ink-soft"
            }`}
          >
            {project.name}
          </span>
          {project.system ? (
            <span
              className="rounded-[3px] border border-border px-1 text-[9px] font-semibold uppercase tracking-[0.04em] text-muted"
              title="System project"
            >
              sys
            </span>
          ) : null}
        </div>
        <div className="tabular text-[11px] text-muted-soft">
          {project.userCount} · {project.activeSessionCount} active
        </div>
      </div>
    </button>
  );
}
