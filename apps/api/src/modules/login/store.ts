import { ReconnectingRedisClient, type RedisBackedStore } from "../../http/security";

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

export function createLoginCodeStore(redisUrl: string | null): LoginCodeStore {
  if (redisUrl) {
    return new RedisLoginCodeStore(redisUrl);
  }

  return new MemoryLoginCodeStore();
}

class MemoryLoginCodeStore implements LoginCodeStore {
  async connect(): Promise<void> {}

  async set(code: string, payload: PendingLoginCode): Promise<void> {
    pruneExpiredCodes();
    pendingLoginCodes.set(code, payload);
  }

  async get(code: string): Promise<PendingLoginCode | null> {
    pruneExpiredCodes();
    const pending = pendingLoginCodes.get(code);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingLoginCodes.delete(code);
      return null;
    }

    return pending;
  }

  async delete(code: string): Promise<void> {
    pendingLoginCodes.delete(code);
  }

  async close(): Promise<void> {}
}

class RedisLoginCodeStore implements LoginCodeStore {
  private readonly client: ReconnectingRedisClient;

  constructor(redisUrl: string) {
    this.client = new ReconnectingRedisClient(redisUrl);
  }

  connect(): Promise<void> {
    return this.client.connect();
  }

  async set(code: string, payload: PendingLoginCode): Promise<void> {
    await this.client.withClient((redis) =>
      redis.set(loginCodeKey(code), JSON.stringify(payload), "EX", LOGIN_CODE_TTL_SECONDS)
    );
  }

  async get(code: string): Promise<PendingLoginCode | null> {
    const value = await this.client.withClient((redis) => redis.get(loginCodeKey(code)));
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as PendingLoginCode;
    if (parsed.expiresAt < Date.now()) {
      await this.delete(code);
      return null;
    }

    return parsed;
  }

  async delete(code: string): Promise<void> {
    await this.client.withClient((redis) => redis.del(loginCodeKey(code)));
  }

  close(): void {
    this.client.close();
  }
}

function loginCodeKey(code: string): string {
  return `auth:login-code:${code}`;
}

function pruneExpiredCodes(now = Date.now()): void {
  for (const [code, payload] of pendingLoginCodes) {
    if (payload.expiresAt < now) {
      pendingLoginCodes.delete(code);
    }
  }
}
