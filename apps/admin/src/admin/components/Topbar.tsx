import { useMemo } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import {
  Button as AriaButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
  Tooltip,
  TooltipTrigger
} from "react-aria-components";

import type { Theme } from "@nezdemkovski/auth-client-shared/theme";
import type { MeResponse, ProjectSummary } from "../types";
import { pad2 } from "../utils/format";
import { ThemeToggle } from "@nezdemkovski/auth-ui";

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
  isNewProject,
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
  isNewProject: boolean;
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
    <header className="backdrop-header sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-bg/85 px-6 lg:px-10">
      <BreadcrumbSwitcher
        workspace={workspace}
        selected={selected}
        selectedSlug={selectedSlug}
        isSettings={isSettings}
        isNewProject={isNewProject}
        projects={projects}
        loading={loading}
        onSelect={onSelect}
      />

      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
        <TooltipTrigger delay={400} closeDelay={120}>
          <AriaButton
            onPress={onSignOut}
            aria-label={`Sign out ${me.user.email}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-ink-soft outline-none transition-colors hover:bg-surface-hover hover:text-ink data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--focus-ring)] data-[pressed]:scale-[0.97]"
          >
            <LogOut size={14} strokeWidth={1.8} />
          </AriaButton>
          <Tooltip
            placement="bottom"
            offset={6}
            className="mono shadow-card rounded-md border border-border bg-surface px-2 py-1 text-[10.5px] uppercase tracking-[0.06em] text-muted outline-none data-[entering]:animate-[toast-in_140ms_ease-out]"
          >
            Signed in as {me.user.email}
          </Tooltip>
        </TooltipTrigger>
      </div>
    </header>
  );
}

const ITEM_BASE =
  "relative flex h-8 cursor-pointer items-center rounded-md px-2 text-left outline-none transition-colors data-[focused]:bg-surface-hover";

const SECTION_HEADER =
  "mono px-2 pb-1 text-[10px] uppercase tracking-[0.1em] text-muted-soft";

function BreadcrumbSwitcher({
  workspace,
  selected,
  selectedSlug,
  isSettings,
  isNewProject,
  projects,
  loading,
  onSelect
}: {
  workspace: string;
  selected: ProjectSummary | undefined;
  selectedSlug: string;
  isSettings: boolean;
  isNewProject: boolean;
  projects: ProjectSummary[];
  loading: boolean;
  onSelect: (slug: string) => void;
}) {
  const label = isSettings
    ? "settings"
    : isNewProject
    ? "new"
    : selected
    ? selected.slug
    : "overview";

  return (
    <nav
      aria-label="Breadcrumb"
      className="mono flex min-w-0 items-center gap-px text-[12px] uppercase tracking-[0.06em]"
    >
      <span className="text-muted-soft">/</span>
      <span className="px-1.5 py-1 text-muted">{workspace}</span>
      <span className="text-muted-soft">/</span>
      <MenuTrigger>
        <AriaButton
          aria-label="Switch project"
          className="shadow-card group ml-1 inline-flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-ink outline-none transition-colors hover:bg-surface-hover data-[pressed]:scale-[0.98] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--focus-ring)]"
        >
          <span className="truncate">{label}</span>
          <ChevronDown
            size={13}
            strokeWidth={1.8}
            className="shrink-0 text-muted-soft transition-transform duration-150 group-data-[pressed]:text-ink"
          />
        </AriaButton>
        <Popover
          placement="bottom start"
          offset={8}
          className="shadow-elevated enter w-[320px] overflow-hidden rounded-xl border border-border bg-surface outline-none"
        >
          <Menu
            aria-label="Switch project"
            className="max-h-[420px] overflow-y-auto p-3 outline-none"
            onAction={(key) => onSelect(String(key))}
          >
            <MenuSection>
              <Header className={SECTION_HEADER}>Workspace</Header>
              <MenuItem
                id="__overview__"
                className={`${ITEM_BASE} text-[13.5px] ${
                  selectedSlug === "__overview__" ? "text-ink" : "text-muted"
                }`}
              >
                {selectedSlug === "__overview__" ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent"
                  />
                ) : null}
                <span
                  className={
                    selectedSlug === "__overview__"
                      ? "ml-1.5 font-medium"
                      : "ml-1.5"
                  }
                >
                  Overview
                </span>
              </MenuItem>
              <MenuItem
                id="__settings__"
                className={`${ITEM_BASE} text-[13.5px] ${
                  selectedSlug === "__settings__" ? "text-ink" : "text-muted"
                }`}
              >
                {selectedSlug === "__settings__" ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent"
                  />
                ) : null}
                <span
                  className={
                    selectedSlug === "__settings__"
                      ? "ml-1.5 font-medium"
                      : "ml-1.5"
                  }
                >
                  Settings
                </span>
              </MenuItem>
              <MenuItem
                id="__new_project__"
                className={`${ITEM_BASE} text-[13.5px] ${
                  selectedSlug === "__new_project__" ? "text-ink" : "text-muted"
                }`}
              >
                {selectedSlug === "__new_project__" ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent"
                  />
                ) : null}
                <span
                  className={
                    selectedSlug === "__new_project__"
                      ? "ml-1.5 font-medium"
                      : "ml-1.5"
                  }
                >
                  New realm
                </span>
              </MenuItem>
            </MenuSection>

            <Separator className="my-2 h-px bg-border" />

            <MenuSection>
              <Header className={SECTION_HEADER}>
                <span className="flex items-baseline justify-between">
                  <span>Realms</span>
                  <span className="tabular text-[10px] tracking-[0.04em] text-muted-soft">
                    {pad2(projects.length)}
                  </span>
                </span>
              </Header>
              {loading ? (
                <div className="space-y-1 px-2 pt-1">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-7 animate-pulse rounded bg-surface-hover"
                    />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="px-2 pt-1 text-[12px] text-muted-soft">
                  No realms yet.
                </div>
              ) : (
                projects.map((project, idx) => {
                  const active = selectedSlug === project.slug;
                  return (
                    <MenuItem
                      key={project.slug}
                      id={project.slug}
                      textValue={project.name}
                      className={`${ITEM_BASE} items-baseline gap-3`}
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
                        {pad2(idx + 1)}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] ${
                          active ? "font-medium text-ink" : "text-muted"
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
                    </MenuItem>
                  );
                })
              )}
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
    </nav>
  );
}
