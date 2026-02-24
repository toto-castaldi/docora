# Phase 10: Git Concurrency Fix - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Serialize git operations per repository path to prevent corruption under concurrent BullMQ jobs. Two apps watching the same repo must both complete snapshot jobs without git errors. Different repos must remain parallel (no global lock). Must support multi-worker deployment sharing the same /data/repos volume.

</domain>

<decisions>
## Implementation Decisions

### Clone strategy
- Shared clone per repo at `/data/repos/{owner}/{repo}` (current layout preserved)
- When two apps watch the same repo with different tokens, serialize access and swap the token URL under lock
- No per-app or per-token clone directories — one clone per repo path

### Lock design
- Distributed lock (Redis-based) to support multiple worker processes/containers sharing the same volume
- Lock key is the filesystem path (e.g., `/data/repos/owner/repo`)
- Lock covers ALL git operations on that path: clone, fetch, reset, delete
- Auto-expiry TTL on the Redis lock to handle crashed workers (prevents permanent deadlock)

### Contention behavior
- Jobs waiting for a locked repo timeout after 60 seconds (configurable)
- On timeout, throw a distinct `LockTimeoutError` so it's distinguishable from actual git errors
- BullMQ retries the job using its existing retry/backoff logic (retryable error, not permanent failure)

### Lock failure visibility
- Log only — contention events do NOT surface in the admin dashboard
- Log levels: `warn` for lock waits, `error` for timeouts, `debug` for normal acquire/release
- Log messages include the lock-holder's job ID for traceability (e.g., "Job 42 waiting for lock on owner/repo, held by job 37")

### Claude's Discretion
- Choice of Redis lock library (redlock, ioredis-lock, custom implementation)
- Auto-expiry TTL duration (should be longer than the 60s wait timeout)
- Lock key format/namespacing in Redis
- How to integrate the lock into the existing snapshot worker flow

</decisions>

<specifics>
## Specific Ideas

- Current `git.ts` already does `remote set-url origin` on every pull (line 79), so token swapping under lock is a natural fit
- The lock must wrap the entire `cloneOrPull` call, not just individual git commands
- BullMQ already has retry logic configured — the lock timeout error should be thrown in a way that triggers retries, not permanent failure

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-git-concurrency-fix*
*Context gathered: 2026-02-24*
