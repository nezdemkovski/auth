import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronDownIcon, SignOutIcon } from "../../icons";
import type { Theme } from "../../theme";
import type { MeResponse, ProjectSummary } from "../types";
import { pad2 } from "../utils/format";
import { ThemeToggle } from "./primitives";

function getWorkspaceName(): string {
  if (typeof window === "undefined") return "workspace";
  const host = window.location.host.split(":")[0];
  const cleaned = host.replace(/^auth\./, "");
  const first = cleaned.split(".")[0];
  return first || "workspace";
}

export function Topbar({
  selected,
  selectedSlug,
  isSettings,
  projects,
  loading,
  onSelect,
  me,
  theme,
  onToggleTheme,
  onSignOut
}: {
  selected: ProjectSummary | undefined;
  selectedSlug: string;
  isSettings: boolean;
  projects: ProjectSummary[];
  loading: boolean;
  onSelect: (slug: string) => void;
  syncedAt: number;
  me: MeResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const workspace = useMemo(getWorkspaceName, []);

  return (
    <header
      className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-bg/85 px-6 lg:px-10"
      style={{ backdropFilter: "saturate(180%) blur(8px)" }}
    >
      <BreadcrumbSwitcher
        workspace={workspace}
        selected={selected}
        selectedSlug={selectedSlug}
        isSettings={isSettings}
        projects={projects}
        loading={loading}
        onSelect={onSelect}
      />

      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
        <button
          type="button"
          onClick={onSignOut}
          data-press
          aria-label={`Sign out ${me.user.email}`}
          title={`Signed in as ${me.user.email} · Sign out`}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-ink-soft outline-none transition-colors hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <SignOutIcon size={14} />
        </button>
      </div>
    </header>
  );
}

function BreadcrumbSwitcher({
  workspace,
  selected,
  selectedSlug,
  isSettings,
  projects,
  loading,
  onSelect
}: {
  workspace: string;
  selected: ProjectSummary | undefined;
  selectedSlug: string;
  isSettings: boolean;
  projects: ProjectSummary[];
  loading: boolean;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleSelect(slug: string) {
    onSelect(slug);
    setOpen(false);
  }

  const label = isSettings
    ? "settings"
    : selected
    ? selected.slug
    : "overview";

  return (
    <div ref={rootRef} className="relative min-w-0">
      <nav
        aria-label="Breadcrumb"
        className="mono flex min-w-0 items-center gap-px text-[12px] uppercase tracking-[0.06em]"
      >
        <span className="text-muted-soft">/</span>
        <span className="px-1.5 py-1 text-muted">{workspace}</span>
        <span className="text-muted-soft">/</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Switch project"
          className={`group ml-1 inline-flex min-w-0 items-center gap-2 rounded-md border bg-surface px-2 py-1 text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
            open
              ? "border-border-strong"
              : "border-border hover:bg-surface-hover"
          }`}
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon
            size={13}
            className={`shrink-0 transition-transform duration-150 ${
              open ? "rotate-180 text-ink" : "text-muted-soft group-hover:text-ink"
            }`}
          />
        </button>
      </nav>

      {open ? (
        <div
          role="menu"
          className="enter absolute left-0 top-full mt-2 w-[320px] overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          <div className="px-3 pb-1 pt-3">
            <div className="mono px-2 text-[10px] uppercase tracking-[0.1em] text-muted-soft">
              Workspace
            </div>
            <SwitcherItem
              label="Overview"
              active={selectedSlug === "__overview__"}
              onClick={() => handleSelect("__overview__")}
            />
            <SwitcherItem
              label="Settings"
              active={selectedSlug === "__settings__"}
              onClick={() => handleSelect("__settings__")}
            />
          </div>

          <div className="my-1 h-px bg-border" />

          <div className="px-3 pb-3 pt-1">
            <div className="mono flex items-baseline justify-between px-2">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-soft">
                Projects
              </span>
              <span className="tabular text-[10px] tracking-[0.04em] text-muted-soft">
                {pad2(projects.length)}
              </span>
            </div>
            {loading ? (
              <div className="space-y-1 px-2 pt-2">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-7 animate-pulse rounded bg-surface-hover"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2 pt-2 text-[12px] text-muted-soft">
                No projects configured.
              </div>
            ) : (
              <ul className="space-y-px pt-1">
                {projects.map((project, idx) => (
                  <SwitcherProjectItem
                    key={project.slug}
                    index={idx + 1}
                    project={project}
                    active={selectedSlug === project.slug}
                    onClick={() => handleSelect(project.slug)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SwitcherItem({
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
      role="menuitem"
      onClick={onClick}
      data-press
      className={`relative mt-1 flex h-8 w-full items-center rounded-md px-2 text-left text-[13.5px] outline-none transition-colors ${
        active
          ? "bg-surface-muted text-ink"
          : "text-muted hover:bg-surface-hover hover:text-ink"
      }`}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent"
        />
      ) : null}
      <span className={active ? "ml-1.5 font-medium" : "ml-1.5"}>{label}</span>
    </button>
  );
}

function SwitcherProjectItem({
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
        role="menuitem"
        onClick={onClick}
        data-press
        className={`group relative flex h-8 w-full items-baseline gap-3 rounded-md px-2 text-left outline-none transition-colors ${
          active ? "bg-surface-muted" : "hover:bg-surface-hover"
        }`}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent"
          />
        ) : null}
        <span
          className={`mono tabular ml-1.5 w-5 shrink-0 text-[10.5px] tracking-[0.04em] ${
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
