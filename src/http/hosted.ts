import type { AuthRegistry } from "../auth/registry";

const CODE_TTL_SECONDS = 60;

type PendingHostedCode = {
  project: string;
  sessionCookie: string;
  email: string;
  redirectUri: string;
  expiresAt: number;
};

type HostedOptions = {
  registry: AuthRegistry;
  secret: string;
};

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

const pendingHostedCodes = new Map<string, PendingHostedCode>();

function createCode(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url"
  );
}

function consumeCode(code: string): PendingHostedCode | null {
  const pending = pendingHostedCodes.get(code);
  pendingHostedCodes.delete(code);

  if (!pending || pending.expiresAt < Date.now()) {
    return null;
  }

  return pending;
}

function redirectUriAllowed(
  registry: AuthRegistry,
  project: string,
  redirectUri: string
): boolean {
  try {
    const url = new URL(redirectUri);
    return registry.isTrustedOrigin(project, url.origin);
  } catch {
    return false;
  }
}

function renderLoginPage(options: {
  projectName: string;
  project: string;
  redirectUri: string;
  state: string;
  mode: string;
  error?: string;
}): Response {
  const isSignup = options.mode === "signup";
  const title = isSignup ? "Create account" : "Log in";
  const alternateMode = isSignup ? "login" : "signup";
  const alternateText = isSignup
    ? "Already have an account? Log in"
    : "Need an account? Sign up";
  const query = new URLSearchParams({
    redirect_uri: options.redirectUri,
    state: options.state,
    mode: alternateMode
  });

  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - ${escapeHtml(options.projectName)}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #080b11; color: #f8fafc; }
      main { width: min(420px, calc(100vw - 32px)); }
      form { border: 1px solid #202938; background: #0f172a; border-radius: 16px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
      h1 { margin: 0 0 6px; font-size: 28px; letter-spacing: 0; }
      p { margin: 0 0 24px; color: #94a3b8; }
      label { display: block; margin: 16px 0 6px; font-size: 14px; color: #cbd5e1; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #334155; border-radius: 10px; background: #020617; color: #f8fafc; padding: 12px; font-size: 16px; }
      button { width: 100%; margin-top: 20px; border: 0; border-radius: 10px; background: #22c55e; color: #052e16; padding: 12px; font-weight: 700; font-size: 16px; }
      a { display: block; margin-top: 18px; color: #86efac; text-align: center; text-decoration: none; }
      .error { margin: 0 0 12px; border: 1px solid #7f1d1d; background: #450a0a; color: #fecaca; border-radius: 10px; padding: 10px 12px; }
    </style>
  </head>
  <body>
    <main>
      <form method="post" action="/${escapeHtml(options.project)}/login">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(options.projectName)}</p>
        ${options.error ? `<div class="error">${escapeHtml(options.error)}</div>` : ""}
        <input type="hidden" name="redirect_uri" value="${escapeHtml(options.redirectUri)}" />
        <input type="hidden" name="state" value="${escapeHtml(options.state)}" />
        <input type="hidden" name="mode" value="${escapeHtml(options.mode)}" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
        <button type="submit">${escapeHtml(title)}</button>
        <a href="/${escapeHtml(options.project)}/login?${escapeHtml(query.toString())}">${escapeHtml(alternateText)}</a>
      </form>
    </main>
  </body>
</html>`);
}

async function issueSession(options: {
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>;
  mode: string;
  email: string;
  password: string;
}): Promise<{ sessionCookie: string; email: string } | null> {
  const body =
    options.mode === "signup"
      ? {
          email: options.email,
          password: options.password,
          name: options.email.split("@")[0]
        }
      : {
          email: options.email,
          password: options.password
        };
  const endpoint =
    options.mode === "signup" ? "/sign-up/email" : "/sign-in/email";
  const authPath = `/${options.registered.project.slug}/api/auth`;

  const authRes = await options.registered.auth.handler(
    new Request(`http://auth.local${authPath}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  );

  if (!authRes.ok) {
    return null;
  }

  const cookies = authRes.headers.getSetCookie();
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const sessionRes = await options.registered.auth.handler(
    new Request(`http://auth.local${authPath}/get-session`, {
      headers: {
        Cookie: cookie
      }
    })
  );

  if (!sessionRes.ok) {
    return null;
  }

  const session = await sessionRes.json().catch(() => null);
  const email =
    typeof session?.user?.email === "string" ? session.user.email : options.email;

  return {
    sessionCookie: cookie,
    email
  };
}

export function renderHostedLogin(
  req: Request,
  project: string,
  options: HostedOptions
): Response {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const mode = url.searchParams.get("mode") === "signup" ? "signup" : "login";

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return html("Invalid redirect_uri", 400);
  }

  return renderLoginPage({
    project,
    projectName: registered.project.name,
    redirectUri,
    state,
    mode
  });
}

export async function submitHostedLogin(
  req: Request,
  project: string,
  options: HostedOptions
): Promise<Response> {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const form = await req.formData();
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const mode = form.get("mode") === "signup" ? "signup" : "login";
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return html("Invalid redirect_uri", 400);
  }

  const session = await issueSession({
    registered,
    mode,
    email,
    password
  });

  if (!session) {
    return renderLoginPage({
      project,
      projectName: registered.project.name,
      redirectUri,
      state,
      mode,
      error: mode === "signup" ? "Could not create account" : "Invalid email or password"
    });
  }

  const code = createCode();
  pendingHostedCodes.set(code, {
    project,
    sessionCookie: session.sessionCookie,
    email: session.email,
    redirectUri,
    expiresAt: Date.now() + CODE_TTL_SECONDS * 1000
  });

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) {
    callback.searchParams.set("state", state);
  }

  return Response.redirect(callback.toString(), 302);
}

export async function exchangeHostedCode(
  req: Request,
  project: string,
  options: HostedOptions
): Promise<Response> {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const redirectUri =
    typeof body?.redirect_uri === "string" ? body.redirect_uri : "";

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return json({ error: "invalid_redirect_uri" }, 400);
  }

  const payload = consumeCode(code);
  if (
    !payload ||
    payload.project !== project ||
    payload.redirectUri !== redirectUri
  ) {
    return json({ error: "invalid_code" }, 400);
  }

  return json({
    sessionCookie: payload.sessionCookie,
    email: payload.email
  });
}
