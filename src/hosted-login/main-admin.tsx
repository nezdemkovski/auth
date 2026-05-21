import {
  QueryClient,
  QueryClientProvider,
  useQuery
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./style.css";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

type MeResponse = {
  user: AdminUser;
  mustChangePassword: boolean;
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

  useEffect(() => {
    void loadSession().then(setView);
  }, []);

  const content = useMemo(() => {
    if (view.status === "loading") {
      return <LoadingPanel />;
    }

    if (view.status === "signed-out") {
      return <LoginPanel error={view.error} onDone={setView} />;
    }

    if (view.status === "force-change") {
      return <ChangePasswordPanel me={view.me} error={view.error} onDone={setView} />;
    }

    return <DashboardPanel me={view.me} onDone={setView} />;
  }, [view]);

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden px-4 py-5 sm:px-8 sm:py-6 lg:px-10">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl min-w-0 flex-col">
        <header className="mb-6 flex min-w-0 items-center justify-between gap-3 sm:mb-8 sm:gap-4">
          <a
            href="/admin"
            className="inline-flex min-w-0 items-center gap-3 text-ink no-underline"
            aria-label="Auth Admin"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-line bg-panel/80 text-sm font-semibold text-accent shadow-[0_18px_50px_rgba(0,0,0,.25)]">
              A
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-5">Auth Admin</span>
              <span className="block truncate text-xs text-muted">Nezdemkovski Cloud</span>
            </span>
          </a>

          {view.status === "dashboard" ? (
            <button
              type="button"
              onClick={() => void signOut().then(() => setView({ status: "signed-out" }))}
              className="shrink-0 rounded-2xl border border-line bg-panel/70 px-3 py-2 text-sm font-medium text-muted transition hover:border-accent/40 hover:text-ink sm:px-4"
            >
              Sign out
            </button>
          ) : null}
        </header>

        <div className="grid min-w-0 flex-1 items-center">{content}</div>
      </div>
    </main>
  );
}

function LoadingPanel() {
  return (
    <section className="mx-auto w-full max-w-[460px] rounded-[28px] border border-line bg-panel/88 p-7 shadow-[0_28px_90px_rgba(0,0,0,.48)] backdrop-blur-xl">
      <div className="mb-5 h-2 w-24 overflow-hidden rounded-full bg-panel-soft">
        <div className="h-full w-2/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
      </div>
      <h1 className="text-3xl font-semibold text-ink">Checking session</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Loading admin workspace access.</p>
    </section>
  );
}

function LoginPanel({
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
    <section className="mx-auto grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_440px]">
      <div className="hidden lg:block">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[.28em] text-accent/80">
          Control plane
        </p>
        <h1 className="max-w-[34rem] text-6xl font-semibold leading-[.96] text-ink">
          One place for projects, users, and sessions.
        </h1>
        <p className="mt-5 max-w-[30rem] text-base leading-7 text-muted">
          The first generated admin password is temporary. After the initial login,
          the dashboard requires a password change before anything else opens.
        </p>
      </div>

      <form
        onSubmit={(event) => void submit(event)}
        className="auth-shell relative overflow-hidden rounded-[28px] border border-line bg-panel/88 p-6 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-7"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.28em] text-accent/80">
            Admin sign in
          </p>
          <h2 className="text-4xl font-semibold text-ink">Log in</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Use the initial admin credentials from the server bootstrap logs.
          </p>

          {error ? <Alert>{error}</Alert> : null}

          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={pending}
            className="mt-7 h-13 w-full rounded-2xl bg-accent-strong text-[15px] font-semibold text-emerald-950 shadow-[0_14px_38px_rgba(34,197,94,.24)] transition hover:-translate-y-0.5 hover:bg-accent disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Checking..." : "Log in"}
          </button>
        </div>
      </form>
    </section>
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
        error: response.status === 400 ? "Use a password with at least 12 characters" : "Could not change password"
      });
      return;
    }

    onDone(await loadSession());
  }

  return (
    <section className="mx-auto w-full max-w-[500px] rounded-[28px] border border-line bg-panel/88 p-6 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-7">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.28em] text-accent/80">
        First login
      </p>
      <h1 className="text-4xl font-semibold text-ink">Change temporary password</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Signed in as {me.user.email}. Pick a permanent password before opening the dashboard.
      </p>

      {error ? <Alert>{error}</Alert> : null}

      <form onSubmit={(event) => void submit(event)} className="mt-6">
        <Field
          label="Temporary password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
        />
        <Field
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-7 h-13 w-full rounded-2xl bg-accent-strong text-[15px] font-semibold text-emerald-950 shadow-[0_14px_38px_rgba(34,197,94,.24)] transition hover:-translate-y-0.5 hover:bg-accent disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save password"}
        </button>
      </form>
    </section>
  );
}

function DashboardPanel({
  me,
  onDone
}: {
  me: MeResponse;
  onDone: (next: ViewState) => void;
}) {
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const [selectedProject, setSelectedProject] = useState("");
  const projects = projectsQuery.data?.projects ?? [];
  const selected = projects.find((project) => project.slug === selectedProject) ?? projects[0];
  const usersQuery = useQuery({
    queryKey: ["admin", "project-users", selected?.slug],
    queryFn: () => fetchProjectUsers(selected!.slug),
    enabled: Boolean(selected?.slug)
  });

  useEffect(() => {
    if (!selectedProject && projects[0]) {
      setSelectedProject(projects[0].slug);
    }
  }, [projects, selectedProject]);

  return (
    <section className="grid min-w-0 max-w-full gap-5 overflow-hidden sm:gap-6">
      <div className="min-w-0 overflow-hidden rounded-[24px] border border-line bg-panel/82 p-5 shadow-[0_28px_90px_rgba(0,0,0,.42)] backdrop-blur-xl sm:rounded-[28px] sm:p-7">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.28em] text-accent/80">
          Dashboard
        </p>
        <h1 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          Signed in as
        </h1>
        <p className="mt-2 max-w-full break-all text-2xl font-semibold leading-tight text-ink/95 sm:text-4xl">
          {me.user.email}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Manage auth realms, users, roles, and active sessions from one place.
        </p>
      </div>

      {projectsQuery.isLoading ? (
        <DashboardSkeleton />
      ) : projectsQuery.isError ? (
        <Alert>Could not load admin data</Alert>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Projects" value={projects.length} />
            <MetricCard
              label="Users"
              value={projects.reduce((sum, project) => sum + project.userCount, 0)}
            />
            <MetricCard
              label="Active sessions"
              value={projects.reduce((sum, project) => sum + project.activeSessionCount, 0)}
            />
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="grid min-w-0 gap-3 self-start">
              {projects.map((project) => (
                <button
                  key={project.slug}
                  type="button"
                  onClick={() => setSelectedProject(project.slug)}
                  className={`min-w-0 rounded-3xl border p-4 text-left transition ${
                    selected?.slug === project.slug
                      ? "border-accent/60 bg-accent/10"
                      : "border-line bg-panel/70 hover:border-accent/30"
                  }`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <h2 className="min-w-0 truncate text-lg font-semibold text-ink">
                      {project.name}
                    </h2>
                    {project.system ? (
                      <span className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[.12em] text-accent">
                        system
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{project.schema}</p>
                  <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                    <span>{project.userCount} users</span>
                    <span>{project.activeSessionCount} sessions</span>
                  </div>
                </button>
              ))}
            </aside>

            <section className="min-w-0 overflow-hidden rounded-[24px] border border-line bg-panel/78 shadow-[0_28px_90px_rgba(0,0,0,.36)] backdrop-blur-xl sm:rounded-[28px]">
              <div className="border-b border-line p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-accent/80">
                  Users
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  {selected?.name ?? "Project"}
                </h2>
              </div>

              {usersQuery.isLoading ? (
                <div className="p-5 text-sm text-muted">Loading users...</div>
              ) : usersQuery.isError ? (
                <div className="p-5">
                  <Alert>Could not load users</Alert>
                </div>
              ) : (
                <UserList users={usersQuery.data?.users ?? []} />
              )}
            </section>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => void signOut().then(() => onDone({ status: "signed-out" }))}
        className="w-fit max-w-full rounded-2xl border border-line bg-panel/70 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/40 hover:text-ink"
      >
        Sign out
      </button>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-3xl border border-line bg-panel/70 p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-ink">{value}</p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-28 animate-pulse rounded-3xl border border-line bg-panel/70" />
      ))}
    </div>
  );
}

function UserList({ users }: { users: ProjectUser[] }) {
  if (users.length === 0) {
    return <div className="p-5 text-sm text-muted">No users in this project yet.</div>;
  }

  return (
    <div className="divide-y divide-line">
      {users.map((user) => (
        <article key={user.id} className="grid min-w-0 gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h3 className="break-all text-base font-semibold text-ink">{user.email}</h3>
            <p className="mt-1 truncate text-sm text-muted">{user.name || "No display name"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{user.role ?? "user"}</Pill>
              <Pill>{user.emailVerified ? "verified" : "unverified"}</Pill>
              {user.banned ? <Pill tone="danger">banned</Pill> : null}
            </div>
          </div>
          <div className="text-left text-sm text-muted sm:text-right">
            <p>{user.sessionCount} active sessions</p>
            <p className="mt-1">created {formatDate(user.createdAt)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function Pill({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        tone === "danger"
          ? "border-red-400/30 bg-red-950/40 text-danger"
          : "border-line bg-black/20 text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
}) {
  return (
    <label className="mt-5 block">
      <span className="mb-2 block text-sm font-medium text-ink/80">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="h-13 w-full rounded-2xl border border-line bg-black/28 px-4 text-[16px] text-ink outline-none transition focus:border-accent/70 focus:bg-black/40 focus:shadow-[0_0_0_4px_rgba(110,231,168,.08)]"
      />
    </label>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-950/55 px-4 py-3 text-sm text-danger">
      {children}
    </div>
  );
}

async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch("/admin/api/projects", {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Could not load projects");
  }

  return (await response.json()) as ProjectsResponse;
}

async function fetchProjectUsers(project: string): Promise<ProjectUsersResponse> {
  const response = await fetch(`/admin/api/projects/${project}/users`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Could not load users");
  }

  return (await response.json()) as ProjectUsersResponse;
}

async function loadSession(): Promise<ViewState> {
  const response = await fetch("/admin/api/me", {
    credentials: "include"
  });

  if (response.status === 401) {
    return { status: "signed-out" };
  }

  if (!response.ok) {
    return { status: "signed-out", error: "Admin API is unavailable" };
  }

  const me = (await response.json()) as MeResponse;
  return me.mustChangePassword ? { status: "force-change", me } : { status: "dashboard", me };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium"
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
