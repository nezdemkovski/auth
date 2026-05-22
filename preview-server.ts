import { serve } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "dist", "hosted-login");

const HOSTED_CONFIG = {
  project: "openmarkers",
  projectName: "OpenMarkers",
  redirectUri: "https://app.openmarkers.com/callback",
  state: "preview-state",
  mode: "login" as const,
  codeChallenge: "preview-challenge-43-chars-or-more-padding-here-yep"
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
    system: true,
    userCount: 1,
    activeSessionCount: 1
  },
  {
    slug: "openmarkers",
    name: "OpenMarkers",
    schema: "openmarkers_auth",
    system: false,
    userCount: 247,
    activeSessionCount: 38
  },
  {
    slug: "noona",
    name: "Noona",
    schema: "noona_auth",
    system: false,
    userCount: 89,
    activeSessionCount: 12
  },
  {
    slug: "lobby",
    name: "Lobby",
    schema: "lobby_auth",
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

function injectHostedConfig(html: string): string {
  const tag = `<script>window.__HOSTED_AUTH__ = ${JSON.stringify(HOSTED_CONFIG)};</script>`;
  return html.replace("<!-- hosted-auth-config -->", tag);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const port = Number(process.env.PORT ?? 4321);

serve({
  port,
  fetch(req) {
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
    if (path === "/admin/api/projects") return json({ projects: PROJECTS });
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

    if (path === "/" || path === "/admin" || path === "/admin/") {
      const html = readFileSync(join(ROOT, "admin.html"), "utf8");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    if (path === "/login" || path === "/openmarkers/login") {
      const html = readFileSync(join(ROOT, "index.html"), "utf8");
      return new Response(injectHostedConfig(html), {
        headers: { "Content-Type": "text/html" }
      });
    }

    let file = path;
    if (file.startsWith("/hosted/")) file = file.slice("/hosted".length);
    return new Response(Bun.file(join(ROOT, file)));
  }
});

console.log(`preview server on http://localhost:${port}`);
