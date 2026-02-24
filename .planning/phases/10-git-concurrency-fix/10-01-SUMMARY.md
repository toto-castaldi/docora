---
phase: 10-git-concurrency-fix
plan: 01
subsystem: infra
tags: [redlock, redis, distributed-lock, concurrency, bullmq]

# Dependency graph
requires:
  - phase: 05-worker-resilience
    provides: "BullMQ snapshot worker, circuit breaker, retry logic"
provides:
  - "Per-repo distributed mutex via Redlock (withRepoLock)"
  - "LockTimeoutError for BullMQ retry integration"
  - "Graceful shutdown via shutdownRepoLock"
affects: [snapshot-worker, repository-management, worker-shutdown]

# Tech tracking
tech-stack:
  added: [redlock 5.0.0-beta.2]
  patterns: [per-resource distributed locking, lazy singleton with dedicated Redis connection]

key-files:
  created:
    - src/services/repo-lock.ts
    - src/types/redlock.d.ts
    - tests/services/repo-lock.test.ts
  modified:
    - src/workers/snapshot.worker.ts
    - src/services/repository-management.ts
    - tests/services/repository-management.test.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Used Redlock with dedicated Redis connection (not shared BullMQ connection) to avoid blocking interference"
  - "LockTimeoutError is a plain Error (not UnrecoverableError) so BullMQ retries on lock contention"
  - "Lock scope is minimal: only filesystem-touching git operations are locked, not scan/notify/save"

patterns-established:
  - "Per-resource locking: withRepoLock(repoPath, jobId, fn) pattern for any future filesystem-exclusive operations"
  - "Ambient type declarations in src/types/ for packages with broken ESM exports"

requirements-completed: [RACE-01]

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 10 Plan 01: Repo Lock Summary

**Redis-based per-repo distributed mutex using Redlock to serialize concurrent git operations (clone/pull/delete) per repository path**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-24T18:52:47Z
- **Completed:** 2026-02-24T18:58:56Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created `repo-lock` service with `withRepoLock`, `LockTimeoutError`, and `shutdownRepoLock` exports
- Integrated per-repo lock into snapshot worker (wraps cloneOrPull + circuit breaker) and repository-management (wraps deleteLocalRepository)
- Lock keys match across both integration points (`owner/name`), ensuring mutual exclusion between concurrent snapshots and unwatch operations
- 6 new unit tests covering acquire/release lifecycle, error propagation, timeout, lock key format, and error type identity

## Task Commits

Each task was committed atomically:

1. **Task 1: Create repo-lock service with Redlock and tests** - `577c345` (feat)
2. **Task 2: Integrate repo lock into snapshot worker and repository management** - `6fc74d4` (feat)

## Files Created/Modified
- `src/services/repo-lock.ts` - Per-repo distributed mutex with withRepoLock, LockTimeoutError, shutdownRepoLock
- `src/types/redlock.d.ts` - Ambient type declaration for redlock package (broken ESM exports)
- `tests/services/repo-lock.test.ts` - 6 unit tests for lock service
- `src/workers/snapshot.worker.ts` - Wrapped git operations in withRepoLock
- `src/services/repository-management.ts` - Wrapped deleteLocalRepository in withRepoLock
- `tests/services/repository-management.test.ts` - Added repo-lock mock for existing tests
- `package.json` - Added redlock dependency
- `pnpm-lock.yaml` - Lock file updated

## Decisions Made
- Used Redlock with a dedicated Redis connection (`createRedisConnection()`) rather than the shared BullMQ connection to avoid blocking interference between lock retries and queue operations
- LockTimeoutError extends plain Error (not UnrecoverableError) so BullMQ retries on lock contention -- this is correct behavior since contention is transient
- Lock scope is deliberately minimal: only filesystem-touching git operations are locked. Scan, notification, snapshot save, and DB operations remain outside the lock to minimize contention and TTL risk

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ambient type declaration for redlock**
- **Found during:** Task 1
- **Issue:** Redlock v5 beta ships types at `dist/index.d.ts` but its `package.json` `exports` field lacks a `types` entry, causing TypeScript NodeNext module resolution to fail with TS7016
- **Fix:** Created `src/types/redlock.d.ts` with ambient module declaration re-exporting the shapes we use
- **Files modified:** src/types/redlock.d.ts
- **Verification:** `pnpm typecheck` passes cleanly
- **Committed in:** 577c345 (Task 1 commit)

**2. [Rule 1 - Bug] Updated repository-management test with repo-lock mock**
- **Found during:** Task 2
- **Issue:** Orphan-path tests in repository-management.test.ts timed out because `withRepoLock` (newly imported by repository-management.ts) attempted real Redis connection
- **Fix:** Added `vi.mock("../../src/services/repo-lock.js")` with pass-through implementation
- **Files modified:** tests/services/repository-management.test.ts
- **Verification:** All 67 tests pass
- **Committed in:** 6fc74d4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required. Redlock uses the existing Redis connection (same Redis instance as BullMQ).

## Next Phase Readiness
- Per-repo distributed lock is active and integrated
- Lock key format (`owner/name`) is consistent across snapshot worker and unwatch flow
- `shutdownRepoLock()` is available for graceful shutdown integration in future phases
- All tests pass, TypeScript compiles cleanly, build succeeds

---
*Phase: 10-git-concurrency-fix*
*Completed: 2026-02-24*
