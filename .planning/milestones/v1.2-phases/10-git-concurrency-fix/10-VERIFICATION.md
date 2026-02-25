---
phase: 10-git-concurrency-fix
verified: 2026-02-24T20:02:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 10: Git Concurrency Fix Verification Report

**Phase Goal:** Git operations on shared repository paths are safe under concurrent BullMQ job execution
**Verified:** 2026-02-24T20:02:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Two concurrent snapshot jobs for the same repo are serialized (only one holds the lock at a time) | VERIFIED | `withRepoLock` in `snapshot.worker.ts:166` acquires Redlock with key `docora:repo-lock:${owner}/${name}`; try/finally guarantees release before next caller can acquire |
| 2 | Two concurrent snapshot jobs for different repos execute in parallel (per-repo lock keys) | VERIFIED | Lock key is `docora:repo-lock:${repoPath}` — different repo paths produce different keys; no global lock exists |
| 3 | If a git operation fails mid-lock, the mutex is released and subsequent operations proceed | VERIFIED | `withRepoLock` uses try/finally for release: `finally { await lock.release(); }` at `repo-lock.ts:106`. Test "should release lock even if callback throws" confirms propagation |
| 4 | Lock timeout throws a distinct LockTimeoutError that BullMQ retries | VERIFIED | `LockTimeoutError extends Error` (not `UnrecoverableError`) at `repo-lock.ts:36-44`. Test "LockTimeoutError should not be an UnrecoverableError" confirms it's a plain Error. BullMQ retries plain errors |
| 5 | deleteLocalRepository is also protected by the same per-repo lock | VERIFIED | `repository-management.ts:43-49` wraps `deleteLocalRepository` in `withRepoLock(`${repoInfo.owner}/${repoInfo.name}`, ...)` — identical key format to snapshot worker |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/repo-lock.ts` | Redis-based per-repo distributed mutex using Redlock | VERIFIED | 120 lines, exports `withRepoLock`, `LockTimeoutError`, `shutdownRepoLock`; uses `createRedisConnection()` (dedicated connection, not shared BullMQ connection) |
| `tests/services/repo-lock.test.ts` | Unit tests for lock acquire, release, timeout, and error propagation | VERIFIED | 122 lines (exceeds min_lines: 50); 6 test cases, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/workers/snapshot.worker.ts` | `src/services/repo-lock.ts` | withRepoLock wrapping cloneOrPull call | WIRED | Import at line 15; `withRepoLock(`${owner}/${name}`, ...)` at line 166 wrapping entire git block including cloneOrPull and circuit breaker |
| `src/services/repository-management.ts` | `src/services/repo-lock.ts` | withRepoLock wrapping deleteLocalRepository call | WIRED | Import at line 8; `withRepoLock(`${repoInfo.owner}/${repoInfo.name}`, ...)` at line 43 wrapping `deleteLocalRepository` call |
| `src/services/repo-lock.ts` | `src/queue/connection.ts` | getRedisConnection for Redlock client | WIRED | Import `createRedisConnection` at line 10; called at `repo-lock.ts:52` inside `getRedlock()` to create dedicated Redis connection |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RACE-01 | 10-01-PLAN.md | Git operations on the same repository path are serialized via per-repo mutex, preserving parallelism across different repositories | SATISFIED | `withRepoLock` serializes same-repo git ops in both snapshot worker and unwatch flow; different repos use different lock keys so they remain parallel |

No orphaned requirements: REQUIREMENTS.md maps only RACE-01 to Phase 10, and it is claimed and implemented by 10-01-PLAN.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

Scanned: `src/services/repo-lock.ts`, `src/workers/snapshot.worker.ts`, `src/services/repository-management.ts`, `tests/services/repo-lock.test.ts`. No TODOs, placeholders, empty implementations, or stub returns detected.

### Human Verification Required

None. All success criteria are verifiable programmatically:
- Lock acquisition/release behavior: covered by unit tests (6/6 pass)
- TypeScript correctness: `pnpm typecheck` passes with no errors
- Full test suite: 67/67 tests pass across 10 test files
- Commits verified: `577c345` (repo-lock service + tests) and `6fc74d4` (integrations) both exist in git history

### Additional Observations

1. **Lock scope is correctly minimal.** In `snapshot.worker.ts`, the lock wraps only `cloneOrPull` + `resetGitFailures` + circuit breaker error recording. The scan, notification dispatch, and snapshot save sections remain outside the lock, minimizing contention and TTL risk.

2. **Dedicated Redis connection is correctly used.** `repo-lock.ts` calls `createRedisConnection()` (not `getRedisConnection()`) to create a dedicated Redis client for Redlock. This prevents Redlock's blocking retry behavior from interfering with BullMQ's shared connection.

3. **Ambient type declaration added correctly.** `src/types/redlock.d.ts` exists to work around Redlock v5 beta's broken ESM exports. This was a necessary deviation from the plan, correctly resolved and committed.

4. **repository-management test mock added.** `tests/services/repository-management.test.ts` was updated to mock `repo-lock.js` (pass-through mock), preventing orphan-path tests from attempting real Redis connections. All 67 tests pass.

5. **Lock key consistency confirmed.** Snapshot worker uses `` `${owner}/${name}` `` and repository-management uses `` `${repoInfo.owner}/${repoInfo.name}` `` — both resolve to `owner/name` format, ensuring mutual exclusion between concurrent snapshot jobs and unwatch operations on the same repository.

---

_Verified: 2026-02-24T20:02:00Z_
_Verifier: Claude (gsd-verifier)_
