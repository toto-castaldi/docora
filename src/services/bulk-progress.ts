import { randomBytes } from "crypto";
import { getRedisConnection } from "../queue/connection.js";
import type { BulkProgressResponse } from "@docora/shared-types";

const KEY_PREFIX = "docora:bulk:";
const TTL_SECONDS = 3600;

function redisKey(operationId: string): string {
  return `${KEY_PREFIX}${operationId}`;
}

export function generateOperationId(): string {
  return `bulk_${randomBytes(8).toString("hex")}`;
}

export async function createProgress(
  operationId: string,
  total: number
): Promise<void> {
  const redis = getRedisConnection();
  const key = redisKey(operationId);

  await redis.hset(key, {
    total: total.toString(),
    completed: "0",
    succeeded: "0",
    failed: "0",
    cancelled: "false",
  });
  await redis.expire(key, TTL_SECONDS);
}

export async function incrementProgress(
  operationId: string,
  success: boolean
): Promise<void> {
  const redis = getRedisConnection();
  const key = redisKey(operationId);
  const pipeline = redis.pipeline();

  pipeline.hincrby(key, "completed", 1);
  pipeline.hincrby(key, success ? "succeeded" : "failed", 1);
  await pipeline.exec();
}

export async function cancelProgress(operationId: string): Promise<void> {
  const redis = getRedisConnection();
  await redis.hset(redisKey(operationId), "cancelled", "true");
}

export async function isCancelled(operationId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const value = await redis.hget(redisKey(operationId), "cancelled");
  return value === "true";
}

export async function getProgress(
  operationId: string
): Promise<BulkProgressResponse | null> {
  const redis = getRedisConnection();
  const data = await redis.hgetall(redisKey(operationId));

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    operation_id: operationId,
    total: parseInt(data.total, 10),
    completed: parseInt(data.completed, 10),
    succeeded: parseInt(data.succeeded, 10),
    failed: parseInt(data.failed, 10),
    cancelled: data.cancelled === "true",
  };
}
