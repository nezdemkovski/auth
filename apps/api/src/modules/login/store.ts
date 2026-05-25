import { ReconnectingRedisClient, type RedisBackedStore } from "../../db/redis";
import { isRecord } from "../../runtime/type-guards";

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
  consume(
    code: string,
    expected: {
      project: string;
      redirectUri: string;
      codeChallenge: string;
    }
  ): Promise<PendingLoginCode | null>;
  delete(code: string): Promise<void>;
};

export const createLoginCodeStore = (redisUrl: string | null) => {
  if (redisUrl) {
    return new RedisLoginCodeStore(redisUrl);
  }

  return new MemoryLoginCodeStore();
};

class MemoryLoginCodeStore implements LoginCodeStore {
  private readonly pendingLoginCodes = new Map<string, PendingLoginCode>();

  async connect() {}

  async set(code: string, payload: PendingLoginCode) {
    this.pruneExpiredCodes();
    this.pendingLoginCodes.set(code, payload);
  }

  async get(code: string) {
    this.pruneExpiredCodes();
    const pending = this.pendingLoginCodes.get(code);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingLoginCodes.delete(code);
      return null;
    }

    return pending;
  }

  async consume(
    code: string,
    expected: {
      project: string;
      redirectUri: string;
      codeChallenge: string;
    }
  ) {
    this.pruneExpiredCodes();
    const pending = this.pendingLoginCodes.get(code);
    if (
      !pending ||
      pending.expiresAt < Date.now() ||
      pending.project !== expected.project ||
      pending.redirectUri !== expected.redirectUri ||
      pending.codeChallenge !== expected.codeChallenge
    ) {
      return null;
    }

    this.pendingLoginCodes.delete(code);
    return pending;
  }

  async delete(code: string) {
    this.pendingLoginCodes.delete(code);
  }

  async close() {}

  private pruneExpiredCodes(now = Date.now()) {
    for (const [code, payload] of this.pendingLoginCodes) {
      if (payload.expiresAt < now) {
        this.pendingLoginCodes.delete(code);
      }
    }
  }
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

  async consume(
    code: string,
    expected: {
      project: string;
      redirectUri: string;
      codeChallenge: string;
    }
  ) {
    const value = await this.client.withClient((redis) =>
      redis.send("EVAL", [
        CONSUME_LOGIN_CODE_SCRIPT,
        "1",
        loginCodeKey(code),
        expected.project,
        expected.redirectUri,
        expected.codeChallenge,
        String(Date.now())
      ])
    );
    if (typeof value !== "string") {
      return null;
    }

    const parsed = parsePendingLoginCode(value);
    if (!parsed) {
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

const CONSUME_LOGIN_CODE_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then
  return nil
end

local ok, payload = pcall(cjson.decode, value)
if not ok then
  redis.call("DEL", KEYS[1])
  return nil
end

if tonumber(payload.expiresAt) < tonumber(ARGV[4]) then
  redis.call("DEL", KEYS[1])
  return nil
end

if payload.project ~= ARGV[1] then
  return nil
end
if payload.redirectUri ~= ARGV[2] then
  return nil
end
if payload.codeChallenge ~= ARGV[3] then
  return nil
end

redis.call("DEL", KEYS[1])
return value
`;

const parsePendingLoginCode = (value: string) => {
  const parsed: unknown = JSON.parse(value);
  if (!isPendingLoginCode(parsed)) {
    return null;
  }

  return parsed;
};

const isPendingLoginCode = (value: unknown): value is PendingLoginCode => {
  return (
    isRecord(value) &&
    typeof value.project === "string" &&
    typeof value.sessionCookie === "string" &&
    typeof value.email === "string" &&
    typeof value.redirectUri === "string" &&
    typeof value.codeChallenge === "string" &&
    typeof value.expiresAt === "number"
  );
};
