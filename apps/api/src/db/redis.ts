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

  private createClient(redisUrl: string) {
    return new RedisClient(redisUrl, {
      enableOfflineQueue: false,
      maxRetries: 1
    });
  }

  async connect() {
    if (!this.redis.connected) {
      await this.redis.connect();
    }
  }

  async withClient<T>(operation: (redis: RedisClient) => Promise<T>) {
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

  close() {
    this.redis.close();
  }
}

const isClosedRedisConnection = (error: unknown) => {
  return (
    error instanceof Error &&
    Reflect.get(error, "code") === "ERR_REDIS_CONNECTION_CLOSED"
  );
};
