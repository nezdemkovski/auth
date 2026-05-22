import { ChevronRightIcon } from "../../icons";
import type { ProjectSummary } from "../types";
import { pad2 } from "../utils/format";
import { Card, EmptyState, SysTag } from "../components/primitives";
import { StatCard } from "../components/Stats";

export function OverviewView({
  loading,
  projects,
  totals,
  onOpenProject,
  onCreateProject
}: {
  loading: boolean;
  projects: ProjectSummary[];
  totals: { users: number; sessions: number };
  onOpenProject: (slug: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="space-y-10">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">00 — Workspace</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <h1 className="serif text-[56px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          Over<em>view.</em>
        </h1>
        <p className="mt-3 max-w-[36rem] text-[14.5px] leading-[1.55] text-muted">
          Manage auth realms, users, and active sessions.
        </p>
        <button
          type="button"
          data-press
          onClick={onCreateProject}
          className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-ink outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          style={{ boxShadow: "var(--shadow-button)" }}
        >
          New realm
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          index={1}
          label="Realms"
          value={loading ? null : projects.length}
          hint="isolated auth realms"
        />
        <StatCard
          index={2}
          label="Users"
          value={loading ? null : totals.users}
          hint="across all realms"
        />
        <StatCard
          index={3}
          label="Active sessions"
          value={loading ? null : totals.sessions}
          hint="signed in right now"
        />
      </div>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">01 — Realms</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          {!loading && projects.length > 0 ? (
            <span className="eyebrow text-muted-soft tabular">
              {pad2(projects.length)} total
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[110px] animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <EmptyState
              title="No realms yet"
              description="Create a realm to start accepting application users."
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project, idx) => (
              <ProjectCard
                key={project.slug}
                index={idx + 1}
                project={project}
                onOpen={() => onOpenProject(project.slug)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({
  index,
  project,
  onOpen
}: {
  index: number;
  project: ProjectSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-press
      className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <span className="eyebrow mt-1 shrink-0 tabular text-muted-soft">
        {pad2(index)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="serif truncate text-[22px] leading-[1.1] tracking-[-0.02em] text-ink">
            {project.name}
          </span>
          {project.system ? <SysTag /> : null}
        </div>
        <code className="mt-1 block truncate text-[11.5px] font-mono text-muted">
          {project.schema}
        </code>
        {project.description ? (
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-muted">
            {project.description}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
          <span>
            <span className="tabular font-medium text-ink-soft">
              {project.userCount}
            </span>{" "}
            users
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="tabular font-medium text-ink-soft">
              {project.activeSessionCount}
            </span>{" "}
            sessions
          </span>
        </div>
      </div>
      <ChevronRightIcon
        size={14}
        className="mt-1 shrink-0 text-muted-soft transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
      />
    </button>
  );
}
