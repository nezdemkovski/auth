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

type ViewState =
  | { status: "loading" }
  | { status: "signed-out"; error?: string }
  | { status: "force-change"; me: MeResponse; error?: string }
  | { status: "dashboard"; me: MeResponse };

const jsonHeaders = {
  "Content-Type": "application/json"
};

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
    <main className="relative min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col">
        <header className="mb-8 flex items-center justify-between gap-4">
          <a
            href="/admin"
            className="inline-flex items-center gap-3 text-ink no-underline"
            aria-label="Auth Admin"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-panel/80 text-sm font-semibold text-accent shadow-[0_18px_50px_rgba(0,0,0,.25)]">
              A
            </span>
            <span>
              <span className="block text-sm font-semibold leading-5">Auth Admin</span>
              <span className="block text-xs text-muted">Nezdemkovski Cloud</span>
            </span>
          </a>

          {view.status === "dashboard" ? (
            <button
              type="button"
              onClick={() => void signOut().then(() => setView({ status: "signed-out" }))}
              className="rounded-2xl border border-line bg-panel/70 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/40 hover:text-ink"
            >
              Sign out
            </button>
          ) : null}
        </header>

        <div className="grid flex-1 items-center">{content}</div>
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
  const cards = [
    ["Projects", "Manage auth realms and trusted origins."],
    ["Users", "Search users, change roles, ban accounts."],
    ["Sessions", "Inspect active sessions and revoke access."]
  ] as const;

  return (
    <section className="grid gap-6">
      <div className="rounded-[28px] border border-line bg-panel/82 p-7 shadow-[0_28px_90px_rgba(0,0,0,.42)] backdrop-blur-xl">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.28em] text-accent/80">
          Dashboard
        </p>
        <h1 className="text-4xl font-semibold text-ink">Signed in as {me.user.email}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Bootstrap is complete. The next pass can wire these surfaces to Better Auth
          admin endpoints project by project.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(([title, body]) => (
          <article key={title} className="rounded-3xl border border-line bg-panel/70 p-5">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void signOut().then(() => onDone({ status: "signed-out" }))}
        className="w-fit rounded-2xl border border-line bg-panel/70 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/40 hover:text-ink"
      >
        Sign out
      </button>
    </section>
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

async function signOut(): Promise<void> {
  await fetch("/admin/api/auth/sign-out", {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(<AdminApp />);
