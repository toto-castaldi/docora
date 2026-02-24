/**
 * Per-repository distributed mutex using Redlock.
 *
 * Serializes git operations (clone/pull/delete) per repository path
 * so concurrent BullMQ jobs targeting the same repo do not corrupt
 * the working tree. Different repos remain fully parallel.
 */

import Redlock, { ExecutionError, ResourceLockedError } from "redlock";
import { createRedisConnection } from "../queue/connection.js";

// --- Configuration (env-overridable) ---

const LOCK_TTL_MS = parseInt(
  process.env.REPO_LOCK_TTL_MS || "120000",
  10
);

const LOCK_RETRY_COUNT = parseInt(
  process.env.REPO_LOCK_RETRY_COUNT || "30",
  10
);

const LOCK_RETRY_DELAY_MS = parseInt(
  process.env.REPO_LOCK_RETRY_DELAY_MS || "2000",
  10
);

const LOCK_RETRY_JITTER_MS = parseInt(
  process.env.REPO_LOCK_RETRY_JITTER_MS || "400",
  10
);

// --- Error type ---

export class LockTimeoutError extends Error {
  readonly repoPath: string;

  constructor(repoPath: string) {
    super(`Lock timeout acquiring mutex for repo: ${repoPath}`);
    this.name = "LockTimeoutError";
    this.repoPath = repoPath;
  }
}

// --- Singleton Redlock instance ---

let redlock: Redlock | null = null;

function getRedlock(): Redlock {
  if (!redlock) {
    const client = createRedisConnection();

    redlock = new Redlock([client], {
      retryCount: LOCK_RETRY_COUNT,
      retryDelay: LOCK_RETRY_DELAY_MS,
      retryJitter: LOCK_RETRY_JITTER_MS,
    });

    redlock.on("error", (err: Error) => {
      if (err instanceof ResourceLockedError) {
        return; // expected during contention
      }
      console.error("Redlock error:", err);
    });
  }

  return redlock;
}

// --- Public API ---

/**
 * Execute `fn` while holding a per-repo distributed lock.
 *
 * Lock key: `docora:repo-lock:{owner/name}`
 * On timeout: throws LockTimeoutError (regular Error, BullMQ retries).
 */
export async function withRepoLock<T>(
  repoPath: string,
  jobId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `docora:repo-lock:${repoPath}`;

  console.debug(`[job:${jobId}] Acquiring lock on ${repoPath}`);

  let lock;
  try {
    lock = await getRedlock().acquire([lockKey], LOCK_TTL_MS);
  } catch (err) {
    if (err instanceof ExecutionError) {
      console.error(
        `[job:${jobId}] Lock timeout for ${repoPath}: ${err.message}`
      );
      throw new LockTimeoutError(repoPath);
    }
    throw err;
  }

  console.debug(`[job:${jobId}] Lock acquired on ${repoPath}`);

  try {
    return await fn();
  } finally {
    await lock.release();
    console.debug(`[job:${jobId}] Lock released on ${repoPath}`);
  }
}

/**
 * Graceful shutdown: quit the Redlock instance (and its dedicated Redis connection).
 */
export async function shutdownRepoLock(): Promise<void> {
  if (redlock) {
    await redlock.quit();
    redlock = null;
  }
}
