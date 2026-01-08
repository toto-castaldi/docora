import { Redis } from "ioredis";

let redisConnection: Redis | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

export function getRedisOptions() {
  return {
    maxRetriesPerRequest: null,
  };
}

export function createRedisConnection(): Redis {
  return new Redis(getRedisUrl(), getRedisOptions());
}

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = createRedisConnection();

    redisConnection.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    redisConnection.on("connect", () => {
      console.log("Connected to Redis");
    });
  }

  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    console.log("Redis connection closed");
  }
}
