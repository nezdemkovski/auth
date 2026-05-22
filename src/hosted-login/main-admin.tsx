import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  BrandMark,
  ChevronRightIcon,
  HomeIcon,
  MailIcon,
  MoonIcon,
  ShieldIcon,
  SignOutIcon,
  StatusDot,
  SunIcon
} from "./icons";
import "./style.css";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "./theme";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

type MeResponse = {
  user: AdminUser;
  mustChangePassword: boolean;
  emailServiceEnabled: boolean;
};

type ProjectSummary = {
  slug: string;
  name: string;
  schema: string;
  system: boolean;
  userCount: number;
  activeSessionCount: number;
};

type ProjectUser = AdminUser & {
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
};

type ProjectsResponse = {
  projects: ProjectSummary[];
};

type ProjectUsersResponse = {
  project: {
    slug: string;
    name: string;
    schema: string;
  };
  users: ProjectUser[];
};

type ViewState =
  | { status: "loading" }
  | { status: "signed-out"; error?: string }
  | { status: "force-change"; me: MeResponse; error?: string }
  | { status: "dashboard"; me: MeResponse };

const jsonHeaders = {
  "Content-Type": "application/json"
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

function AdminApp() {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    void loadSession().then(setView);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  if (view.status === "loading") {
    return (
      <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
        <LoadingPanel />
      </CenteredShell>
    );
  }

  if (view.status === "signed-out") {
    return (
      <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
        <SignInPanel error={view.error} onDone={setView} />
      </CenteredShell>
    );
  }

  if (view.status === "force-change") {
    return (
      <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
        <ChangePasswordPanel
          me={view.me}
          error={view.error}
          onDone={setView}
        />
      </CenteredShell>
    );
  }

  return (
    <DashboardShell
      me={view.me}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSignOut={() => void signOut().then(() => setView({ status: "signed-out" }))}
    />
  );
}

function CenteredShell({
  children,
  theme,
  onToggleTheme
}: {
  children: React.ReactNode;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />
      <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-2 text-ink">
          <BrandMark size={20} />
          <span className="text-[13.5px] font-medium tracking-[-0.005em]">
            Auth Admin
          </span>
          <span aria-hidden="true" className="text-muted-soft">
            /
          </span>
          <span className="mono text-[12px] uppercase tracking-[0.06em] text-muted">
            Nezdemkovski Cloud
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <div className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[420px]">
          <div className="enter enter-1">{children}</div>
        </div>
      </div>
    </main>
  );
}

function useRelativeNow(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function formatRelative(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function LoadingPanel() {
  return (
    <div className="flex items-center gap-3">
      <Spinner />
      <p className="mono text-[12px] uppercase tracking-[0.08em] text-muted">
        Checking session…
      </p>
    </div>
  );
}

function SignInPanel({
  error,
  onDone
}: {
  error?: string;
  onDone: (next: ViewState) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const response = await fetch("/admin/api/auth/sign-in/email", {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      setPending(false);
      onDone({ status: "signed-out", error: "Invalid email or password" });
      return;
    }

    onDone(await loadSession());
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow">Admin</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <h1 className="serif text-[52px] leading-[0.95] tracking-[-0.03em] text-ink">
        Sign <em>in.</em>
      </h1>
      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        Access the admin control plane.
      </p>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">
        <FormField
          id="admin-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
        />
        <FormField
          id="admin-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <PrimaryButton type="submit" loading={pending}>
          {pending ? "Signing in…" : "Sign in ↗"}
        </PrimaryButton>
      </form>
    </div>
  );
}

function ChangePasswordPanel({
  me,
  error,
  onDone
}: {
  me: MeResponse;
  error?: string;
  onDone: (next: ViewState) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setPending(false);
      onDone({ status: "force-change", me, error: "New passwords do not match" });
      return;
    }

    const response = await fetch("/admin/api/change-password", {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!response.ok) {
      setPending(false);
      onDone({
        status: "force-change",
        me,
        error:
          response.status === 400
            ? "Use a password with at least 12 characters"
            : "Could not change password"
      });
      return;
    }

    onDone(await loadSession());
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="eyebrow">First login</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <h1 className="serif text-[48px] leading-[0.95] tracking-[-0.03em] text-ink">
        Set a new <em>password.</em>
      </h1>
      <p className="mt-3 text-[14px] leading-[1.5] text-muted">
        Signed in as{" "}
        <span className="mono text-[13px] text-ink-soft">{me.user.email}</span>.
        Change the temporary password before continuing.
      </p>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">
        <FormField
          id="current-password"
          name="currentPassword"
          label="Temporary password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <FormField
          id="new-password"
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 12 characters"
        />
        <FormField
          id="confirm-password"
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat new password"
        />
        <PrimaryButton type="submit" loading={pending}>
          {pending ? "Saving…" : "Save password ↗"}
        </PrimaryButton>
      </form>
    </div>
  );
}

function DashboardShell({
  me,
  theme,
  onToggleTheme,
  onSignOut
}: {
  me: MeResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const [selectedSlug, setSelectedSlug] = useState<string>("__overview__");
  const [resentVerificationEmail, setResentVerificationEmail] = useState<string | null>(
    null
  );
  const projects = projectsQuery.data?.projects ?? [];
  const selected = projects.find((project) => project.slug === selectedSlug);
  const usersQuery = useQuery({
    queryKey: ["admin", "project-users", selected?.slug],
    queryFn: () => fetchProjectUsers(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const resendVerification = useMutation({
    mutationFn: (input: { project: string; email: string }) =>
      resendVerificationEmail(input.project, input.email),
    onSuccess: async (_data, variables) => {
      setResentVerificationEmail(variables.email);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
    }
  });

  const totals = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.users += project.userCount;
        acc.sessions += project.activeSessionCount;
        return acc;
      },
      { users: 0, sessions: 0 }
    );
  }, [projects]);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        me={me}
        projects={projects}
        loading={projectsQuery.isLoading}
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
        onSignOut={onSignOut}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="relative min-w-0 flex-1">
        <Topbar
          selected={selected}
          syncedAt={
            usersQuery.dataUpdatedAt ||
            projectsQuery.dataUpdatedAt ||
            Date.now()
          }
        />

        <div className="mx-auto w-full max-w-[1120px] px-6 py-8 lg:px-10 lg:py-10">
          {projectsQuery.isError ? (
            <FormAlert>Could not load admin data.</FormAlert>
          ) : selectedSlug === "__overview__" ? (
            <OverviewView
              loading={projectsQuery.isLoading}
              projects={projects}
              totals={totals}
              onOpenProject={setSelectedSlug}
            />
          ) : selected ? (
            <ProjectView
              project={selected}
              usersQuery={usersQuery}
              emailServiceEnabled={me.emailServiceEnabled}
              resendPendingEmail={
                resendVerification.isPending
                  ? resendVerification.variables?.email ?? null
                  : null
              }
              resendErrorEmail={
                resendVerification.isError
                  ? resendVerification.variables?.email ?? null
                  : null
              }
              resentVerificationEmail={resentVerificationEmail}
              onResendVerification={(email) =>
                resendVerification.mutate({
                  project: selected.slug,
                  email
                })
              }
            />
          ) : (
            <Card>
              <EmptyState
                title="Project not found"
                description="The selected project no longer exists."
              />
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function Sidebar({
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
        {project.name.charAt(0).toUpperCase()}
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

function Topbar({
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

function OverviewView({
  loading,
  projects,
  totals,
  onOpenProject
}: {
  loading: boolean;
  projects: ProjectSummary[];
  totals: { users: number; sessions: number };
  onOpenProject: (slug: string) => void;
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
          A snapshot of every auth realm running on this server.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          index={1}
          label="Projects"
          value={loading ? null : projects.length}
          hint="isolated schemas"
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
          <span className="eyebrow">01 — Projects</span>
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
              title="No projects configured"
              description="Add a project to AUTH_PROJECTS in your environment to get started."
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

function ProjectView({
  project,
  usersQuery,
  emailServiceEnabled,
  resendPendingEmail,
  resendErrorEmail,
  resentVerificationEmail,
  onResendVerification
}: {
  project: ProjectSummary;
  usersQuery: ReturnType<typeof useQuery<ProjectUsersResponse>>;
  emailServiceEnabled: boolean;
  resendPendingEmail: string | null;
  resendErrorEmail: string | null;
  resentVerificationEmail: string | null;
  onResendVerification: (email: string) => void;
}) {
  const users = usersQuery.data?.users ?? [];

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">00 — Realm</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <code className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
            {project.schema}
          </code>
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <h1 className="serif text-[56px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
            {project.name}
            <em>.</em>
          </h1>
          {project.system ? <SysTag size="lg" /> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          index={1}
          label="Users"
          value={project.userCount}
          hint="total accounts"
        />
        <StatCard
          index={2}
          label="Active sessions"
          value={project.activeSessionCount}
          hint="signed in right now"
        />
        <StatCard
          index={3}
          label="Verified"
          value={users.filter((user) => user.emailVerified).length}
          hint={users.length === 0 ? "no users yet" : `of ${users.length} loaded`}
        />
      </div>

      <section>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="eyebrow">01 — Users</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          {!usersQuery.isLoading && users.length > 0 ? (
            <span className="eyebrow text-muted-soft tabular">
              {pad2(users.length)} total
            </span>
          ) : null}
        </div>

        <Card padding={false}>
          {usersQuery.isLoading ? (
            <UsersSkeleton />
          ) : usersQuery.isError ? (
            <div className="p-6">
              <FormAlert>Could not load users.</FormAlert>
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              title="No users yet"
              description="Users will appear here once someone signs up to this realm."
            />
          ) : (
            <UserTable
              users={users}
              emailServiceEnabled={emailServiceEnabled}
              resendPendingEmail={resendPendingEmail}
              resendErrorEmail={resendErrorEmail}
              resentVerificationEmail={resentVerificationEmail}
              onResendVerification={onResendVerification}
            />
          )}
        </Card>
      </section>
    </div>
  );
}

function UserTable({
  users,
  emailServiceEnabled,
  resendPendingEmail,
  resendErrorEmail,
  resentVerificationEmail,
  onResendVerification
}: {
  users: ProjectUser[];
  emailServiceEnabled: boolean;
  resendPendingEmail: string | null;
  resendErrorEmail: string | null;
  resentVerificationEmail: string | null;
  onResendVerification: (email: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <Th>User</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th align="right">Sessions</Th>
            <Th align="right">Joined</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              emailServiceEnabled={emailServiceEnabled}
              resendPending={resendPendingEmail === user.email}
              resendError={resendErrorEmail === user.email}
              resentVerification={resentVerificationEmail === user.email}
              onResendVerification={onResendVerification}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  user,
  emailServiceEnabled,
  resendPending,
  resendError,
  resentVerification,
  onResendVerification
}: {
  user: ProjectUser;
  emailServiceEnabled: boolean;
  resendPending: boolean;
  resendError: boolean;
  resentVerification: boolean;
  onResendVerification: (email: string) => void;
}) {
  return (
    <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-hover">
      <Td>
        <div className="flex items-center gap-3">
          <Avatar email={user.email} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-ink">
              {user.name || user.email.split("@")[0]}
            </div>
            <div className="truncate text-[12px] text-muted">{user.email}</div>
          </div>
        </div>
      </Td>
      <Td>
        <Pill>{user.role ?? "user"}</Pill>
      </Td>
      <Td>
        {user.banned ? (
          <StatusBadge tone="danger" label="Banned" />
        ) : user.emailVerified ? (
          <StatusBadge tone="success" label="Verified" />
        ) : (
          <StatusBadge tone="warning" label="Unverified" />
        )}
      </Td>
      <Td align="right">
        <span className="tabular text-[13px] text-ink-soft">
          {user.sessionCount}
        </span>
      </Td>
      <Td align="right">
        <span className="text-[12.5px] text-muted">
          {formatDate(user.createdAt)}
        </span>
      </Td>
      <Td align="right">
        {!user.emailVerified && !user.banned ? (
          <div className="flex flex-col items-end gap-0.5">
            <button
              type="button"
              data-press
              disabled={!emailServiceEnabled || resendPending}
              onClick={() => onResendVerification(user.email)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              title={
                !emailServiceEnabled
                  ? "Email service is disabled"
                  : "Resend verification email"
              }
            >
              <MailIcon size={12} />
              {resendPending ? "Sending…" : "Resend"}
            </button>
            {resendError ? (
              <span className="text-[11px]" style={{ color: "var(--danger)" }}>
                Failed
              </span>
            ) : null}
            {resentVerification ? (
              <span className="text-[11px]" style={{ color: "var(--success)" }}>
                Sent
              </span>
            ) : null}
          </div>
        ) : null}
      </Td>
    </tr>
  );
}

function Th({
  children,
  align = "left"
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-soft ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left"
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`whitespace-nowrap px-5 py-3 align-middle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}

function UsersSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-4 px-5 py-3.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-surface-hover" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="h-5 w-12 animate-pulse rounded-md bg-surface-hover" />
          <div className="h-5 w-16 animate-pulse rounded-md bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

function StatCard({
  index,
  label,
  value,
  hint
}: {
  index: number;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-surface px-5 py-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{label}</div>
        <span className="eyebrow text-muted-soft">{pad2(index)}</span>
      </div>
      <div className="serif mt-3 text-[44px] leading-none tracking-[-0.035em] text-ink tabular">
        {value === null ? (
          <span className="inline-block h-9 w-16 animate-pulse rounded bg-surface-hover align-middle" />
        ) : (
          value.toLocaleString()
        )}
      </div>
      <div className="mt-2.5 text-[12.5px] text-muted">{hint}</div>
    </div>
  );
}

function StatusBadge({
  tone,
  label
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
      {children}
    </span>
  );
}

function SysTag({ size = "sm" }: { size?: "sm" | "lg" }) {
  const cls =
    size === "lg"
      ? "px-2 py-0.5 text-[11px]"
      : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded border border-border bg-surface-muted font-semibold uppercase tracking-[0.06em] text-muted ${cls}`}
    >
      system
    </span>
  );
}

function EmptyState({
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

function Card({
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

function Avatar({ email, size = 32 }: { email: string; size?: number }) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  const fontSize = Math.max(11, size / 2.7);
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-border bg-surface-muted font-medium text-ink-soft tracking-[-0.01em]"
      style={{
        width: size,
        height: size,
        fontSize: `${fontSize}px`
      }}
    >
      {initial}
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2"
      style={{
        borderColor: "var(--border)",
        borderTopColor: "var(--ink)"
      }}
    />
  );
}

function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft"
        style={{
          transition:
            "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease"
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--border-strong)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}

function PrimaryButton({
  children,
  type = "button",
  loading = false
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={loading}
      data-press
      className="mt-1 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-[14px] font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-75"
      style={{
        boxShadow: "var(--shadow-button)",
        transition: "background-color 140ms ease, transform 120ms"
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.background = "var(--accent-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--accent)";
      }}
    >
      {children}
    </button>
  );
}

function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-5"
      style={{
        background: "var(--danger-bg)",
        borderColor: "var(--danger-border)",
        color: "var(--danger)"
      }}
    >
      <span
        aria-hidden="true"
        className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--danger)" }}
      />
      <span>{children}</span>
    </div>
  );
}

function ThemeToggle({
  theme,
  onToggle,
  compact = false
}: {
  theme: Theme;
  onToggle: () => void;
  compact?: boolean;
}) {
  const next = theme === "dark" ? "light" : "dark";
  const size = compact ? "h-9 w-9" : "h-9 w-9";
  return (
    <button
      type="button"
      onClick={onToggle}
      data-press
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`relative grid ${size} place-items-center rounded-lg border border-border bg-surface text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
    >
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: theme === "dark" ? 1 : 0,
          transform: theme === "dark" ? "scale(1)" : "scale(0.5)",
          filter: theme === "dark" ? "blur(0)" : "blur(4px)"
        }}
      >
        <MoonIcon size={15} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1)" : "scale(0.5)",
          filter: theme === "light" ? "blur(0)" : "blur(4px)"
        }}
      >
        <SunIcon size={15} />
      </span>
    </button>
  );
}

async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch("/admin/api/projects", { credentials: "include" });
  if (!response.ok) throw new Error("Could not load projects");
  return (await response.json()) as ProjectsResponse;
}

async function fetchProjectUsers(project: string): Promise<ProjectUsersResponse> {
  const response = await fetch(`/admin/api/projects/${project}/users`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load users");
  return (await response.json()) as ProjectUsersResponse;
}

async function resendVerificationEmail(project: string, email: string): Promise<void> {
  const response = await fetch(
    `/admin/api/projects/${project}/users/resend-verification`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ email })
    }
  );
  if (!response.ok) throw new Error("Could not send verification email");
}

async function loadSession(): Promise<ViewState> {
  const response = await fetch("/admin/api/me", { credentials: "include" });
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) {
    return { status: "signed-out", error: "Admin API is unavailable" };
  }
  const me = (await response.json()) as MeResponse;
  return me.mustChangePassword
    ? { status: "force-change", me }
    : { status: "dashboard", me };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

async function signOut(): Promise<void> {
  await fetch("/admin/api/auth/sign-out", {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <QueryClientProvider client={queryClient}>
    <AdminApp />
  </QueryClientProvider>
);
