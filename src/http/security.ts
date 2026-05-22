import { randomBytes } from "node:crypto";

import type { MiddlewareHandler } from "hono";
import { RedisClient } from "bun";

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

export type RedisBackedStore = {
  connect(): Promise<void>;
  close(): void | Promise<void>;
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
    const nonce = randomBytes(16).toString("base64url");
    c.set("cspNonce", nonce);
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
        `script-src 'self' 'nonce-${nonce}'`,
        "connect-src 'self'"
      ].join("; ")
    );

    if (isHttps) {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  };
}

export function createRateLimiter(redisUrl: string | null): RateLimiterStore {
  if (redisUrl) {
    return new RedisRateLimiterStore(redisUrl);
  }

  return new MemoryRateLimiterStore();
}

export function rateLimit(
  store: RateLimiterStore,
  options: { trustProxyHeaders: boolean }
): MiddlewareHandler {
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
}

class MemoryRateLimiterStore implements RateLimiterStore {
  async connect(): Promise<void> {}

  async hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult> {
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + rule.windowMs
      });

      return {
        allowed: true
      };
    }

    if (bucket.count >= rule.max) {
      return {
        allowed: false,
        retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
      };
    }

    bucket.count += 1;
    return {
      allowed: true
    };
  }

  async close(): Promise<void> {}
}

class RedisRateLimiterStore implements RateLimiterStore {
  private readonly client: ReconnectingRedisClient;

  constructor(redisUrl: string) {
    this.client = new ReconnectingRedisClient(redisUrl);
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return this.client.withClient((redis) => this.hitRedis(redis, key, rule));
  }

  async close(): Promise<void> {
    this.client.close();
  }

  private async hitRedis(
    redis: RedisClient,
    key: string,
    rule: RateLimitRule
  ): Promise<RateLimitResult> {
    const redisKey = `auth:rate-limit:${key}`;
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.expire(redisKey, Math.ceil(rule.windowMs / 1000));
    }

    if (count > rule.max) {
      const ttl = await redis.ttl(redisKey);

      return {
        allowed: false,
        retryAfter: Math.max(1, ttl)
      };
    }

    return {
      allowed: true
    };
  }
}

export class ReconnectingRedisClient implements RedisBackedStore {
  private redis: RedisClient;

  constructor(private readonly redisUrl: string) {
    this.redis = this.createClient(redisUrl);
  }

  private createClient(redisUrl: string): RedisClient {
    return new RedisClient(redisUrl, {
      enableOfflineQueue: false,
      maxRetries: 1
    });
  }

  async connect(): Promise<void> {
    if (!this.redis.connected) {
      await this.redis.connect();
    }
  }

  async withClient<T>(operation: (redis: RedisClient) => Promise<T>): Promise<T> {
    try {
      await this.connect();
      return await operation(this.redis);
    } catch (error) {
      if (!isClosedRedisConnection(error)) {
        throw error;
      }

      this.redis.close();
      this.redis = this.createClient(this.redisUrl);
      await this.connect();
      return operation(this.redis);
    }
  }

  close(): void {
    this.redis.close();
  }
}

function isClosedRedisConnection(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "ERR_REDIS_CONNECTION_CLOSED"
  );
}

function clientKey(
  headers: Headers,
  options: { trustProxyHeaders: boolean }
): string {
  if (!options.trustProxyHeaders) {
    return "direct";
  }

  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function normalizePath(path: string): string {
  return path.replace(/^\/[^/]+\/api\/auth\//, "/:project/api/auth/");
}

export const __securityTestUtils = {
  clientKey,
  normalizePath
};
