import type { MiddlewareHandler } from "hono";
import type { RedisClient } from "bun";

import { ReconnectingRedisClient } from "../db/redis";

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

type RateLimitResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfter: number;
    };

type RateLimiterStore = {
  connect(): Promise<void>;
  hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult>;
  close(): Promise<void>;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    name: "admin-signin",
    windowMs: 10 * 60 * 1000,
    max: 10,
    match: (method, path) =>
      method === "POST" && path === "/api/admin/auth/sign-in/email"
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
    name: "login-session-code",
    windowMs: 10 * 60 * 1000,
    max: 10,
    match: (method, path) =>
      method === "POST" && /\/login\/session-code$/.test(path)
  },
  {
    name: "login-token",
    windowMs: 60 * 1000,
    max: 30,
    match: (method, path) => method === "POST" && /\/login\/token$/.test(path)
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

export const securityHeaders = (publicBaseUrl: string) => {
  const isHttps = publicBaseUrl.startsWith("https://");

  const middleware: MiddlewareHandler = async (c, next) => {
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
        "font-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'"
      ].join("; ")
    );

    if (isHttps) {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  };

  return middleware;
};

export const createRateLimiter = (redisUrl: string | null) => {
  if (redisUrl) {
    return new RedisRateLimiterStore(redisUrl);
  }

  return new MemoryRateLimiterStore();
};

export const rateLimit = (store: RateLimiterStore, options: { trustProxyHeaders: boolean }) => {
  const middleware: MiddlewareHandler = async (c, next) => {
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
    const key = `${rule.name}:${clientKey(c.req.raw.headers, options)}:${normalizePath(path)}`;
    let result: RateLimitResult;

    try {
      result = await store.hit(key, rule, now);
    } catch (error) {
      console.error("[rate-limit] backend error", error);
      return c.json(
        {
          error: "rate_limit_unavailable"
        },
        503
      );
    }

    if (!result.allowed) {
      return c.json(
        {
          error: "rate_limited"
        },
        429,
        {
          "Retry-After": String(result.retryAfter)
        }
      );
    }

    await next();
  };

  return middleware;
};

class MemoryRateLimiterStore implements RateLimiterStore {
  async connect() {}

  async hit(key: string, rule: RateLimitRule, now: number) {
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + rule.windowMs
      });

      const result: RateLimitResult = {
        allowed: true
      };

      return result;
    }

    if (bucket.count >= rule.max) {
      const result: RateLimitResult = {
        allowed: false,
        retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
      };

      return result;
    }

    bucket.count += 1;
    const result: RateLimitResult = {
      allowed: true
    };

    return result;
  }

  async close() {}
}

class RedisRateLimiterStore implements RateLimiterStore {
  private readonly client: ReconnectingRedisClient;

  constructor(redisUrl: string) {
    this.client = new ReconnectingRedisClient(redisUrl);
  }

  async connect() {
    await this.client.connect();
  }

  async hit(key: string, rule: RateLimitRule) {
    return this.client.withClient((redis) => this.hitRedis(redis, key, rule));
  }

  async close() {
    this.client.close();
  }

  private async hitRedis(
    redis: RedisClient,
    key: string,
    rule: RateLimitRule
  ) {
    const redisKey = `auth:rate-limit:${key}`;
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.expire(redisKey, Math.ceil(rule.windowMs / 1000));
    }

    if (count > rule.max) {
      const ttl = await redis.ttl(redisKey);

      const result: RateLimitResult = {
        allowed: false,
        retryAfter: Math.max(1, ttl)
      };

      return result;
    }

    const result: RateLimitResult = {
      allowed: true
    };

    return result;
  }
}

const clientKey = (headers: Headers, options: { trustProxyHeaders: boolean }) => {
  if (!options.trustProxyHeaders) {
    return "direct";
  }

  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
};

const normalizePath = (path: string) => {
  return path.replace(/^\/api\/[^/]+\/auth\//, "/api/:project/auth/");
};

export const __securityTestUtils = {
  clientKey,
  normalizePath
};
