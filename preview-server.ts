import { serve } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_ROOT = join(import.meta.dir, "apps", "admin", "dist");
const LOGIN_ROOT = join(import.meta.dir, "apps", "login", "dist");

const LOGIN_CONFIG = {
  page: "login",
  project: "openmarkers",
  projectName: "OpenMarkers",
  redirectUri: "https://app.openmarkers.com/callback",
  state: "preview-state",
  mode: "login" as const,
  codeChallenge: "preview-challenge-43-chars-or-more-padding-here-yep",
  features: {
    passkey: { enabled: true },
    twoFactor: { enabled: true, required: "optional" },
    agentAuth: { enabled: false, mode: "read-only" }
  },
  socialProviders: ["github", "google"]
};

const ME_RESPONSE = {
  user: {
    id: "1",
    email: "yuri@noona.app",
    name: "Yuri Nezdemkovski",
    role: "admin"
  },
  mustChangePassword: false,
  emailServiceEnabled: true
};

const PROJECTS = [
  {
    slug: "admin",
    name: "Auth Admin",
    schema: "auth_admin",
    description: "System admin realm for managing auth projects.",
    iconUrl: "",
    appUrl: "",
    trustedOrigins: [],
    system: true,
    userCount: 1,
    activeSessionCount: 1
  },
  {
    slug: "openmarkers",
    name: "OpenMarkers",
    schema: "openmarkers_auth",
    description: "Map notes and field markers.",
    iconUrl: "",
    appUrl: "https://openmarkers.app",
    trustedOrigins: ["https://openmarkers.app"],
    system: false,
    userCount: 247,
    activeSessionCount: 38
  },
  {
    slug: "noona",
    name: "Noona",
    schema: "noona_auth",
    description: "Noona application users.",
    iconUrl: "",
    appUrl: "https://noona.app",
    trustedOrigins: ["https://noona.app"],
    system: false,
    userCount: 89,
    activeSessionCount: 12
  },
  {
    slug: "lobby",
    name: "Lobby",
    schema: "lobby_auth",
    description: "",
    iconUrl: "",
    appUrl: "",
    trustedOrigins: [],
    system: false,
    userCount: 14,
    activeSessionCount: 2
  }
];

const USERS_BY_PROJECT: Record<string, unknown[]> = {
  admin: [
    {
      id: "1",
      email: "yuri@noona.app",
      name: "Yuri Nezdemkovski",
      role: "admin",
      banned: false,
      emailVerified: true,
      createdAt: "2026-01-15T10:00:00Z",
      updatedAt: "2026-05-22T10:00:00Z",
      sessionCount: 1
    }
  ],
  openmarkers: [
    {
      id: "2",
      email: "alice.johnson@example.com",
      name: "Alice Johnson",
      role: "user",
      banned: false,
      emailVerified: true,
      createdAt: "2026-03-10T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z",
      sessionCount: 2
    },
    {
      id: "3",
      email: "bob.smith@bigcompany.io",
      name: "",
      role: "user",
      banned: false,
      emailVerified: false,
      createdAt: "2026-05-21T10:00:00Z",
      updatedAt: "2026-05-21T10:00:00Z",
      sessionCount: 0
    },
    {
      id: "4",
      email: "carol.danvers@example.com",
      name: "Carol Danvers",
      role: "user",
      banned: true,
      emailVerified: true,
      createdAt: "2026-02-01T10:00:00Z",
      updatedAt: "2026-05-01T10:00:00Z",
      sessionCount: 0
    },
    {
      id: "5",
      email: "diana@nicedomain.eu",
      name: "Diana Prince",
      role: "user",
      banned: false,
      emailVerified: true,
      createdAt: "2026-04-08T10:00:00Z",
      updatedAt: "2026-05-19T10:00:00Z",
      sessionCount: 3
    },
    {
      id: "6",
      email: "ed@startup.dev",
      name: "Ed Wilson",
      role: "user",
      banned: false,
      emailVerified: false,
      createdAt: "2026-05-18T10:00:00Z",
      updatedAt: "2026-05-18T10:00:00Z",
      sessionCount: 0
    }
  ],
  noona: [
    {
      id: "7",
      email: "frank@noona.app",
      name: "Frank Castle",
      role: "user",
      banned: false,
      emailVerified: true,
      createdAt: "2026-03-22T10:00:00Z",
      updatedAt: "2026-05-15T10:00:00Z",
      sessionCount: 1
    }
  ],
  lobby: []
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const port = Number(process.env.PORT ?? 4321);

serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/admin/api/me") {
      const cookie = req.headers.get("cookie") ?? "";
      if (cookie.includes("preview=signed-out")) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (cookie.includes("preview=must-change")) {
        return json({ ...ME_RESPONSE, mustChangePassword: true });
      }
      return json(ME_RESPONSE);
    }
    if (path === "/admin/api/projects" && req.method === "GET") {
      return json({ projects: PROJECTS });
    }
    if (path === "/admin/api/projects" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { slug?: string; name?: string };
      const project = {
        slug: body.slug ?? "new-project",
        name: body.name ?? "New Project",
        schema: `${(body.slug ?? "new-project").replaceAll("-", "_")}_auth`,
        description: "",
        iconUrl: "",
        appUrl: "",
        trustedOrigins: [],
        system: false,
        userCount: 0,
        activeSessionCount: 0
      };
      PROJECTS.push(project);
      return json({ project }, 201);
    }
    const usersMatch = path.match(/^\/admin\/api\/projects\/([^/]+)\/users$/);
    if (usersMatch) {
      const slug = usersMatch[1];
      const project = PROJECTS.find((p) => p.slug === slug);
      if (!project) return json({ error: "not_found" }, 404);
      return json({
        project: { slug: project.slug, name: project.name, schema: project.schema },
        users: USERS_BY_PROJECT[slug] ?? []
      });
    }
    if (path.startsWith("/admin/api/")) return json({ ok: true });
    if (path === "/openmarkers/login/config/login") return json(LOGIN_CONFIG);
    if (path === "/openmarkers/login/session-code") {
      return json({ redirectTo: "https://app.openmarkers.com/callback?code=preview-code" });
    }

    if (
      path === "/" ||
      path === "/admin" ||
      path === "/admin/" ||
      (path.startsWith("/admin/") && !path.startsWith("/admin/assets/") && !path.includes("."))
    ) {
      const html = readFileSync(join(ADMIN_ROOT, "index.html"), "utf8");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    if (path === "/login" || path === "/openmarkers/login") {
      const html = readFileSync(join(LOGIN_ROOT, "index.html"), "utf8");
      return new Response(html, {
        headers: { "Content-Type": "text/html" }
      });
    }

    let root = LOGIN_ROOT;
    let file = path;
    if (file.startsWith("/admin/assets/")) {
      root = ADMIN_ROOT;
      file = file.slice("/admin".length);
    }
    if (file.startsWith("/login/")) file = file.slice("/login".length);
    return new Response(Bun.file(join(root, file)));
  }
});

console.log(`preview server on http://localhost:${port}`);
