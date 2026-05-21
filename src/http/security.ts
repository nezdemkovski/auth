import type { MiddlewareHandler } from "hono";

type RateLimitRule = {
  name: string;
  windowMs: number;
  max: number;
  match: (method: string, path: string) => boolean;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    name: "admin-signin",
    windowMs: 10 * 60 * 1000,
    max: 10,
    match: (method, path) =>
      method === "POST" && path === "/admin/api/auth/sign-in/email"
  },
  {
    name: "project-signin",
    windowMs: 10 * 60 * 1000,
    max: 10,
    match: (method, path) =>
      method === "POST" && /\/api\/auth\/sign-in\/email$/.test(path)
  },
  {
    name: "project-signup",
    windowMs: 10 * 60 * 1000,
    max: 5,
    match: (method, path) =>
      method === "POST" && /\/api\/auth\/sign-up\/email$/.test(path)
  },
  {
    name: "hosted-login",
    windowMs: 10 * 60 * 1000,
    max: 10,
    match: (method, path) => method === "POST" && /\/login$/.test(path)
  },
  {
    name: "hosted-token",
    windowMs: 60 * 1000,
    max: 30,
    match: (method, path) => method === "POST" && /\/hosted\/token$/.test(path)
  },
  {
    name: "password-reset",
    windowMs: 10 * 60 * 1000,
    max: 5,
    match: (method, path) =>
      method === "POST" && /\/api\/auth\/.*password/i.test(path)
  },
  {
    name: "email-verification",
    windowMs: 10 * 60 * 1000,
    max: 10,
    match: (method, path) =>
      method === "POST" && /\/api\/auth\/.*verify/i.test(path)
  }
];

export function securityHeaders(publicBaseUrl: string): MiddlewareHandler {
  const isHttps = publicBaseUrl.startsWith("https://");

  return async (c, next) => {
    await next();

    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'"
      ].join("; ")
    );

    if (isHttps) {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  };
}

export function rateLimit(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    const rule = RATE_LIMIT_RULES.find((candidate) =>
      candidate.match(method, path)
    );

    if (!rule) {
      await next();
      return;
    }

    const now = Date.now();
    const key = `${rule.name}:${clientKey(c.req.raw.headers)}:${normalizePath(path)}`;
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + rule.windowMs
      });
      await next();
      return;
    }

    if (bucket.count >= rule.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      return c.json(
        {
          error: "rate_limited"
        },
        429,
        {
          "Retry-After": String(retryAfter)
        }
      );
    }

    bucket.count += 1;
    await next();
  };
}

function clientKey(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function normalizePath(path: string): string {
  return path.replace(/^\/[^/]+\/api\/auth\//, "/:project/api/auth/");
}
