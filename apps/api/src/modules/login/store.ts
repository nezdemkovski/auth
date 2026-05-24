import { ReconnectingRedisClient, type RedisBackedStore } from "../../db/redis";

export const LOGIN_CODE_TTL_SECONDS = 60;

export type PendingLoginCode = {
  project: string;
  sessionCookie: string;
  email: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
};

export type LoginCodeStore = RedisBackedStore & {
  set(code: string, payload: PendingLoginCode): Promise<void>;
  get(code: string): Promise<PendingLoginCode | null>;
  delete(code: string): Promise<void>;
};

const pendingLoginCodes = new Map<string, PendingLoginCode>();

export const createLoginCodeStore = (redisUrl: string | null) => {
  if (redisUrl) {
    return new RedisLoginCodeStore(redisUrl);
  }

  return new MemoryLoginCodeStore();
};

class MemoryLoginCodeStore implements LoginCodeStore {
  async connect() {}

  async set(code: string, payload: PendingLoginCode) {
    pruneExpiredCodes();
    pendingLoginCodes.set(code, payload);
  }

  async get(code: string) {
    pruneExpiredCodes();
    const pending = pendingLoginCodes.get(code);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingLoginCodes.delete(code);
      return null;
    }

    return pending;
  }

  async delete(code: string) {
    pendingLoginCodes.delete(code);
  }

  async close() {}
}

class RedisLoginCodeStore implements LoginCodeStore {
  private readonly client: ReconnectingRedisClient;

  constructor(redisUrl: string) {
    this.client = new ReconnectingRedisClient(redisUrl);
  }

  connect() {
    return this.client.connect();
  }

  async set(code: string, payload: PendingLoginCode) {
    await this.client.withClient((redis) =>
      redis.set(loginCodeKey(code), JSON.stringify(payload), "EX", LOGIN_CODE_TTL_SECONDS)
    );
  }

  async get(code: string) {
    const value = await this.client.withClient((redis) => redis.get(loginCodeKey(code)));
    if (!value) {
      return null;
    }

    const parsed = parsePendingLoginCode(value);
    if (!parsed) {
      await this.delete(code);
      return null;
    }

    if (parsed.expiresAt < Date.now()) {
      await this.delete(code);
      return null;
    }

    return parsed;
  }

  async delete(code: string) {
    await this.client.withClient((redis) => redis.del(loginCodeKey(code)));
  }

  close() {
    this.client.close();
  }
}

const loginCodeKey = (code: string) => {
  return `auth:login-code:${code}`;
};

const pruneExpiredCodes = (now = Date.now()) => {
  for (const [code, payload] of pendingLoginCodes) {
    if (payload.expiresAt < now) {
      pendingLoginCodes.delete(code);
    }
  }
};

const parsePendingLoginCode = (value: string) => {
  const parsed: unknown = JSON.parse(value);
  if (!isPendingLoginCode(parsed)) {
    return null;
  }

  return parsed;
};

function isPendingLoginCode(value: unknown): value is PendingLoginCode {
  return (
    isRecord(value) &&
    typeof value.project === "string" &&
    typeof value.sessionCookie === "string" &&
    typeof value.email === "string" &&
    typeof value.redirectUri === "string" &&
    typeof value.codeChallenge === "string" &&
    typeof value.expiresAt === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
