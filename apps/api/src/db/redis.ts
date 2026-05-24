import { RedisClient } from "bun";

export type RedisBackedStore = {
  connect(): Promise<void>;
  close(): void | Promise<void>;
};

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
