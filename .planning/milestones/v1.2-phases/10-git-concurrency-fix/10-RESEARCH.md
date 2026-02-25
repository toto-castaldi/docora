# Phase 10: Git Concurrency Fix - Research

**Researched:** 2026-02-24
**Domain:** Distributed mutex / Redis-based locking for concurrent git operations
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Clone strategy**: Shared clone per repo at `/data/repos/{owner}/{repo}` (current layout preserved). When two apps watch the same repo with different tokens, serialize access and swap the token URL under lock. No per-app or per-token clone directories.
- **Lock design**: Distributed lock (Redis-based) to support multiple worker processes/containers sharing the same volume. Lock key is the filesystem path (e.g., `/data/repos/owner/repo`). Lock covers ALL git operations on that path: clone, fetch, reset, delete. Auto-expiry TTL on the Redis lock to handle crashed workers.
- **Contention behavior**: Jobs waiting for a locked repo timeout after 60 seconds (configurable). On timeout, throw a distinct `LockTimeoutError` so it's distinguishable from actual git errors. BullMQ retries the job using its existing retry/backoff logic (retryable error, not permanent failure).
- **Lock failure visibility**: Log only — contention events do NOT surface in the admin dashboard. Log levels: `warn` for lock waits, `error` for timeouts, `debug` for normal acquire/release. Log messages include the lock-holder's job ID for traceability.

### Claude's Discretion
- Choice of Redis lock library (redlock, ioredis-lock, custom implementation)
- Auto-expiry TTL duration (should be longer than the 60s wait timeout)
- Lock key format/namespacing in Redis
- How to integrate the lock into the existing snapshot worker flow

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RACE-01 | Git operations on the same repository path are serialized via per-repo mutex, preserving parallelism across different repositories | Redlock library provides per-resource distributed locking with auto-expiry TTL; `using()` API handles acquire/release lifecycle; lock key = repo path ensures per-repo granularity while allowing parallel access to different repos |
</phase_requirements>

## Summary

The core problem is that BullMQ processes snapshot jobs concurrently (default concurrency=5), and two jobs for different apps can target the same repository path simultaneously. This causes git `index.lock` conflicts and wrong-token fetches when `remote set-url` runs mid-operation for a different app's token.

The solution is a Redis-based distributed mutex using the **Redlock** library (npm `redlock` v5). Redlock is the standard implementation of the Redis distributed lock algorithm, works with a single Redis instance (which Docora already has for BullMQ), and provides auto-expiry TTL to prevent permanent deadlocks from crashed workers. The lock wraps the entire `cloneOrPull` call in `git.ts`, keyed by the repo filesystem path, ensuring only one job at a time can perform git operations on any given repository while different repos remain fully parallel.

**Primary recommendation:** Use `redlock` v5 with the existing ioredis connection. Create a `src/services/repo-lock.ts` module that exposes an `acquireRepoLock()` function. Integrate it in the snapshot worker around the `cloneOrPull` call. Use Redlock's `acquire()`/`release()` API with a 120s TTL and 60s retry window, throwing a custom `LockTimeoutError` on timeout so BullMQ retries the job.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `redlock` | ^5.0.0-beta.2 | Distributed Redis mutex | Standard implementation of the Redlock algorithm; 3M+ weekly npm downloads; works with ioredis out of the box; supports single and multi-instance Redis; ESM + CJS dual output |
| `ioredis` | ^5.9.1 | Redis client (already installed) | Already in use for BullMQ queue connections; Redlock accepts ioredis client instances directly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bullmq` | ^5.66.4 | Job queue (already installed) | Already handles retry/backoff; `UnrecoverableError` for permanent failures vs regular `throw` for retryable errors |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `redlock` | Raw `SET NX EX` via ioredis | Simpler but requires hand-rolling retry logic, TTL extension, and safe release (Lua script for atomic check-and-delete). Redlock handles all of this. |
| `redlock` | `ioredis-lock` | Last published 2019, no ESM support, limited maintenance. Not recommended. |
| `redlock` | In-process `Map<string, Promise>` mutex | Only works for a single worker process. CONTEXT.md explicitly requires distributed lock for multi-worker support. |

**Recommendation: Use `redlock`.** It is the ecosystem standard, handles edge cases (TTL extension, safe release via Lua scripts, retry with jitter), and directly accepts the ioredis client Docora already uses. The raw `SET NX EX` approach would require hand-rolling the same logic that Redlock already provides and tests.

**Installation:**
```bash
pnpm add redlock
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── git.ts                  # Existing: cloneOrPull, deleteLocalRepository (unchanged)
│   └── repo-lock.ts            # NEW: Redis mutex for repo paths
├── workers/
│   └── snapshot.worker.ts      # Modified: wrap cloneOrPull with lock
└── queue/
    └── connection.ts           # Existing: Redis connection (reused by Redlock)
```

### Pattern 1: Lock Service Module (`repo-lock.ts`)
**What:** A dedicated module that creates a Redlock instance (singleton), exposes `withRepoLock(repoPath, jobId, fn)` that acquires the lock, runs the callback, and releases.
**When to use:** Every git operation on a shared repo path.
**Example:**
```typescript
// Source: Context7 /mike-marcacci/node-redlock - acquire/release pattern
import Redlock, { ResourceLockedError } from "redlock";
import { getRedisConnection } from "../queue/connection.js";

const LOCK_TTL_MS = 120_000;      // 120s auto-expiry (longer than wait timeout)
const LOCK_RETRY_COUNT = 30;       // 30 retries * 2s delay = 60s max wait
const LOCK_RETRY_DELAY_MS = 2000;  // 2s between retries
const LOCK_RETRY_JITTER_MS = 400;  // random jitter to reduce thundering herd

let redlockInstance: Redlock | null = null;

function getRedlock(): Redlock {
  if (!redlockInstance) {
    redlockInstance = new Redlock([getRedisConnection()], {
      retryCount: LOCK_RETRY_COUNT,
      retryDelay: LOCK_RETRY_DELAY_MS,
      retryJitter: LOCK_RETRY_JITTER_MS,
    });

    redlockInstance.on("error", (error) => {
      if (error instanceof ResourceLockedError) return;
      console.error("Redlock error:", error);
    });
  }
  return redlockInstance;
}

export class LockTimeoutError extends Error {
  constructor(repoPath: string) {
    super(`Lock timeout waiting for repo: ${repoPath}`);
    this.name = "LockTimeoutError";
  }
}

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
  } catch (error) {
    console.error(`[job:${jobId}] Lock timeout on ${repoPath}`);
    throw new LockTimeoutError(repoPath);
  }

  console.debug(`[job:${jobId}] Lock acquired on ${repoPath}`);
  try {
    return await fn();
  } finally {
    await lock.release();
    console.debug(`[job:${jobId}] Lock released on ${repoPath}`);
  }
}
```

### Pattern 2: Worker Integration
**What:** The snapshot worker wraps its `cloneOrPull` call inside `withRepoLock`.
**When to use:** In `processSnapshotJob`, around the git clone/pull section only (not the entire job).
**Example:**
```typescript
// In snapshot.worker.ts - wrap only the git operation
const { localPath, commitSha, branch } = await withRepoLock(
  `${owner}/${name}`,
  job.id ?? "unknown",
  async () => {
    const result = await cloneOrPull(github_url, owner, name, githubToken);
    await resetGitFailures(repository_id);
    return result;
  }
);
```

### Pattern 3: LockTimeoutError as Retryable
**What:** BullMQ distinguishes retryable errors (regular `throw`) from permanent failures (`UnrecoverableError`). `LockTimeoutError` is a regular Error, so BullMQ's existing retry/backoff handles it automatically.
**When to use:** When a job cannot acquire the lock within the 60s window.
**Example:**
```typescript
// BullMQ behavior:
// - Regular Error (including LockTimeoutError) → retried per attempts/backoff config
// - UnrecoverableError → moved to failed set immediately, no retry
// No code changes needed in BullMQ config — existing retry logic handles it
```

### Anti-Patterns to Avoid
- **Global lock:** Using a single lock key for all repos would serialize ALL git operations, destroying parallelism. Lock key MUST include the repo path.
- **Lock around entire job:** The lock should only cover git operations (clone/pull), not the scan, notification, or snapshot save. Holding the lock too long increases contention and TTL risk.
- **Forgetting `finally` for release:** If `cloneOrPull` throws, the lock must still be released. The `try/finally` pattern in `withRepoLock` handles this.
- **Short TTL with long git operations:** A TTL shorter than the longest possible git operation (large repo clone) could cause the lock to expire mid-operation. 120s TTL provides safety margin.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed mutex | Custom `SET NX EX` + Lua release script | `redlock` v5 | Safe release requires atomic check-and-delete (Lua); retry logic needs jitter to avoid thundering herd; TTL extension for long operations — all built into Redlock |
| Lock retry with backoff | Custom retry loop with setTimeout | Redlock's built-in `retryCount`/`retryDelay`/`retryJitter` | Battle-tested, configurable, handles edge cases |
| Lock expiry safety | Manual `setTimeout` to release stale locks | Redlock's TTL auto-expiry | Redis TTL is atomic and reliable; manual timers can drift or miss if process crashes |

**Key insight:** The Redis distributed lock problem has subtle failure modes (clock drift, partial failures, unsafe release). Redlock handles all of them. A hand-rolled solution would need to reimplement the same Lua scripts and retry logic.

## Common Pitfalls

### Pitfall 1: Lock Key Must Match Filesystem Path Semantics
**What goes wrong:** Using `owner/name` as lock key but the actual filesystem path is `/data/repos/owner/name`. If code constructs paths differently in different places, two callers might use different lock keys for the same directory.
**Why it happens:** Lock key and filesystem path are constructed independently.
**How to avoid:** Use the same `getLocalRepoPath()` function output (or `owner/name` consistently) as the lock key. The lock key does not need to be the full absolute path — it just needs to be a consistent identifier per repo.
**Warning signs:** Two jobs running git commands on the same directory simultaneously despite locking.

### Pitfall 2: TTL Too Short for Large Repo Clones
**What goes wrong:** A large repository takes 90+ seconds to clone. If TTL is 60s, the lock expires mid-clone, and another job starts operating on the same partially-cloned directory.
**Why it happens:** TTL was set based on expected operation time, not worst case.
**How to avoid:** Set TTL to 120s (double the 60s wait timeout). For very large repos, consider Redlock's `automaticExtensionThreshold` to auto-extend the lock while the operation is still running.
**Warning signs:** Lock expiry warnings in logs while git operations are still in progress.

### Pitfall 3: Redlock Instance Reuse
**What goes wrong:** Creating a new Redlock instance per lock acquisition wastes resources and may cause connection issues.
**Why it happens:** Not using singleton pattern.
**How to avoid:** Create Redlock once at module level (lazy singleton), reuse across all lock acquisitions.
**Warning signs:** Redis connection count growing over time.

### Pitfall 4: `deleteLocalRepository` Also Needs Lock
**What goes wrong:** Repository deletion (from `repository-management.ts` via unwatch) races with a concurrent clone/pull on the same path.
**Why it happens:** Only `cloneOrPull` was wrapped with the lock, but `deleteLocalRepository` also modifies the filesystem.
**How to avoid:** Wrap `deleteLocalRepository` calls in the same `withRepoLock` using the same lock key. The `unwatchRepository` flow should acquire the repo lock before deleting the local clone.
**Warning signs:** `ENOENT` or `EACCES` errors during git operations after a concurrent unwatch.

### Pitfall 5: Graceful Shutdown and Lock Release
**What goes wrong:** Worker receives SIGTERM, BullMQ's `worker.close()` waits for active jobs, but if a job is waiting for a lock, it blocks shutdown.
**Why it happens:** Redlock's retry loop is not cancellable by default.
**How to avoid:** This is a minor concern because BullMQ's `worker.close()` already handles graceful shutdown by waiting for active jobs to complete. The 60s lock timeout ensures waiting jobs don't block forever. No special handling needed beyond existing shutdown logic.
**Warning signs:** Worker taking >60s to shut down.

## Code Examples

Verified patterns from official sources:

### Redlock Initialization with Single ioredis Client
```typescript
// Source: Context7 /mike-marcacci/node-redlock
import Redlock from "redlock";
import Client from "ioredis";

const redis = new Client({ host: "localhost", port: 6379 });
const redlock = new Redlock([redis], {
  retryCount: 10,
  retryDelay: 200,
  retryJitter: 200,
});
```

### Acquire and Release with Error Handling
```typescript
// Source: Context7 /mike-marcacci/node-redlock
import Redlock, { ResourceLockedError, ExecutionError } from "redlock";

try {
  const lock = await redlock.acquire(["resource:key"], 5000);
  try {
    // Critical section
    await performOperation();
  } finally {
    await lock.release();
  }
} catch (error) {
  if (error instanceof ExecutionError) {
    // Failed to acquire lock within retry window
    console.error("Lock acquisition failed:", error.message);
  }
}
```

### BullMQ UnrecoverableError for Permanent Failures
```typescript
// Source: Context7 /websites/bullmq_io - stop-retrying-jobs
import { UnrecoverableError } from "bullmq";

// Regular throw → BullMQ retries (LockTimeoutError should be this)
throw new Error("Temporary failure");

// UnrecoverableError → no retry, job moves to failed immediately
throw new UnrecoverableError("Permanent failure");
```

### Redlock Error Event Monitoring
```typescript
// Source: Context7 /mike-marcacci/node-redlock
import Redlock, { ResourceLockedError } from "redlock";

redlock.on("error", (error) => {
  if (error instanceof ResourceLockedError) {
    return; // Expected during contention, not an error
  }
  console.error("Redlock error:", error);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SET NX EX` + manual Lua release | Redlock library (abstracts SET NX + Lua) | Redlock v5 (2022) | No need to write/maintain Lua scripts |
| In-process mutex (`async-mutex`) | Redis-based distributed lock | When scaling to multiple workers | Works across processes/containers sharing a volume |
| Redlock v4 (CJS only) | Redlock v5 (ESM + CJS dual) | 2022 | Compatible with ESM projects like Docora |

**Deprecated/outdated:**
- `ioredis-lock`: Last published 2019, no ESM, effectively abandoned. Not recommended.
- Redlock v4: CJS only, incompatible with Docora's ESM setup. Use v5.

## Open Questions

1. **`automaticExtensionThreshold` value**
   - What we know: Redlock can auto-extend locks when the remaining TTL drops below a threshold (only with the `using()` API). This prevents lock expiry during long-running operations.
   - What's unclear: Whether `cloneOrPull` can ever take longer than 120s. For shallow clones with `--depth 1`, even large repos are fast.
   - Recommendation: Start with 120s TTL without auto-extension. If monitoring shows TTL expiry in production, add auto-extension later. Keep it simple.

2. **Lock key: `owner/name` vs full path**
   - What we know: Lock key just needs to be a unique, consistent string per repo. Both `owner/name` and `/data/repos/owner/name` work.
   - What's unclear: Whether the full path adds any value over the shorter `owner/name`.
   - Recommendation: Use `owner/name` as the suffix with a `docora:repo-lock:` prefix. Shorter, readable in logs, and uniquely identifies the repo within Docora's namespace.

## Sources

### Primary (HIGH confidence)
- [Context7 /mike-marcacci/node-redlock](https://context7.com/mike-marcacci/node-redlock/llms.txt) - Lock acquisition/release API, `using()` pattern, error types, constructor options, ioredis integration
- [Context7 /taskforcesh/bullmq](https://context7.com/taskforcesh/bullmq/llms.txt) - Worker concurrency, UnrecoverableError, retry/backoff configuration
- [Context7 /redis/ioredis](https://context7.com/redis/ioredis/llms.txt) - SET NX EX pattern, Lua scripting, transaction support
- [Context7 /websites/bullmq_io](https://context7.com/websites/bullmq_io/llms.txt) - Stop retrying jobs pattern, exponential backoff config

### Secondary (MEDIUM confidence)
- [Redlock npm page](https://www.npmjs.com/package/redlock) - Package version, download stats
- [Redlock GitHub](https://github.com/mike-marcacci/node-redlock) - ESM/CJS dual output, package.json structure
- [Redis official distributed locks docs](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) - Redlock algorithm specification

### Tertiary (LOW confidence)
- None — all findings verified through primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Redlock is the established Redis distributed lock library, verified via Context7 and npm
- Architecture: HIGH - Pattern is straightforward (wrap git calls with lock), codebase structure is clear
- Pitfalls: HIGH - Well-documented failure modes in distributed locking literature; verified against Docora's specific code paths

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable domain, no fast-moving dependencies)
