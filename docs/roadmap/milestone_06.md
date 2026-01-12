Periodic Re-Scanning with Circuit Breaker
==========================================

> **STATUS: COMPLETED**

# Summary

This milestone introduces periodic re-scanning of synced repositories and a circuit breaker pattern to prevent hammering failing endpoints.

# Goals

- Automatically re-scan synced repositories at configurable intervals
- Detect changes since the last scan and notify client apps
- Implement circuit breaker to pause scanning after consecutive git failures
- Auto-resume scanning after cooldown period expires

# User Story

As an onboarded app, I want my registered repositories to be periodically re-scanned so I receive notifications about file changes without manual intervention.

# Scope

## Included

- Periodic re-scanning of `synced` repositories
- Configurable rescan interval via `RESCAN_INTERVAL_MS`
- Circuit breaker pattern for git failures
- Automatic circuit recovery after cooldown
- Logging for rescan vs initial snapshot

## Not Included

- Per-repository or per-app rescan intervals (global only)
- Manual circuit breaker reset API
- Webhook for circuit breaker state changes

## Circuit Breaker Auto-Reset

When a repository is re-registered (via `POST /api/repositories`), the circuit breaker is automatically reset:
- `consecutive_failures` set to 0
- `circuit_open_until` cleared

This ensures a fresh start when an app re-registers a previously failed repository.

---

# Architecture

## Circuit Breaker Scope

| Failure Type | Scope | Handling |
|-------------|-------|----------|
| Git clone/pull failure | Repository | Circuit breaker on `repositories` table |
| GitHub auth failure | Repository | Circuit breaker on `repositories` table |
| Webhook 5xx | App-specific | Existing `app_repositories.retry_count` |
| Webhook 4xx | App-specific | Mark `app_repositories.status = 'failed'` |

**Rationale**: Git failures affect ALL apps watching a repo. Notification failures are per-app.

## State Flow

```
                         +--------------------------------------+
                         |                                      |
                         v                                      |
            pending_snapshot -----> scanning -----> synced      |
                    ^                   |            |          |
                    |                   |            | (interval elapsed)
                    |                   v            v          |
                    |              (git failure)  (picked up for rescan)
                    |                   |                       |
                    |                   v                       |
                    |         consecutive_failures++            |
                    |                   |                       |
                    |       +-----------+-----------+           |
                    |       |                       |           |
                    |   < threshold             >= threshold    |
                    |       |                       |           |
                    |       v                       v           |
                    +-- pending_snapshot      circuit_open -----+
                                                   |
                                                   | (cooldown elapsed)
                                                   v
                                              (try again - half-open)
```

## Database Changes

New columns on `repositories` table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `consecutive_failures` | INTEGER | 0 | Count of consecutive git failures |
| `circuit_open_until` | TIMESTAMPTZ | NULL | When circuit breaker expires |

---

# Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RESCAN_INTERVAL_MS` | 300000 (5 min) | How often to rescan synced repos |
| `CIRCUIT_BREAKER_THRESHOLD` | 5 | Consecutive git failures before opening circuit |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | 1800000 (30 min) | How long circuit stays open |

---

# Implementation

## Files Modified

| File | Change |
|------|--------|
| `deploy/liquibase/changelog/005-periodic-scanning.yml` | New migration |
| `src/db/types/repositories.ts` | Add circuit breaker types |
| `src/repositories/repositories.ts` | Add `findRepositoriesForRescan`, `recordGitFailure`, `resetGitFailures` |
| `src/workers/snapshot.scheduler.ts` | Use new rescan query, handle stale jobs |
| `src/workers/snapshot.worker.ts` | Add circuit breaker handling |
| `src/services/git.ts` | Fix shallow clone fetch, add commit logging |
| `.env.example` | Add new environment variables |

## Key Functions

### `findRepositoriesForRescan(rescanIntervalMs: number)`

Queries repositories that need scanning:
- Initial: `status = 'pending_snapshot'`
- Rescan: `status = 'synced'` AND (`last_scanned_at` older than interval OR NULL)
- Retry: `status = 'failed'` AND `circuit_open_until IS NULL` (notification failures only)
- Circuit not open: `circuit_open_until IS NULL OR < NOW()`

### `recordGitFailure(repositoryId: string)`

Called when git clone/pull fails:
- Atomically increments `consecutive_failures`
- If threshold exceeded, sets `circuit_open_until`
- Returns `{ circuitOpened: boolean }`

### `resetGitFailures(repositoryId: string)`

Called when git clone/pull succeeds:
- Resets `consecutive_failures` to 0
- Clears `circuit_open_until`

---

# Acceptance Criteria

- [x] Synced repositories are automatically re-scanned after `RESCAN_INTERVAL_MS`
- [x] Change detection works for re-scans (create/update/delete notifications)
- [x] Circuit breaker opens after `CIRCUIT_BREAKER_THRESHOLD` consecutive git failures
- [x] Circuit breaker auto-closes after `CIRCUIT_BREAKER_COOLDOWN_MS` and successful scan
- [x] Logging distinguishes initial vs rescan jobs
- [x] Environment variables are documented in `.env.example`
- [x] Failed repos (notification failures) are retried on next rescan cycle
- [x] Stale jobs don't block new rescans from being queued

---

# Bugfixes During Testing

The following issues were discovered and fixed during live testing:

## 1. NULL `last_scanned_at` Handling

**Problem**: Repos synced before this feature had `last_scanned_at = NULL`. The query `last_scanned_at < threshold` returns NULL (not true) for NULL values, so these repos were never picked up for rescan.

**Fix**: Added `OR last_scanned_at IS NULL` to the query condition.

## 2. Failed Repos Not Retrying (Notification Failures)

**Problem**: Repos with `status = 'failed'` (due to notification failures) were never retried. Only `synced` repos were considered for rescan.

**Fix**: Added condition to include `status = 'failed'` repos WHERE `circuit_open_until IS NULL`. This distinguishes notification failures (should retry) from git failures (circuit breaker handles).

## 3. Stale Jobs Blocking Queue

**Problem**: BullMQ keeps completed/failed jobs (configured: `removeOnComplete: 100`, `removeOnFail: 200`). The scheduler checked if a job *exists* but not its *state*, so stale jobs blocked new ones from being queued.

**Fix**: Scheduler now checks job state:
- `waiting`, `active`, `delayed` → skip (job is processing)
- `completed`, `failed` → remove stale job, queue new one

## 4. Shallow Clone Fetch Issue

**Problem**: Initial clone uses `--depth 1` (shallow). The fetch command didn't include `--depth 1`, which can cause issues fetching new commits on shallow clones.

**Fix**: Added `--depth 1` to git fetch: `git.fetch(["--depth", "1", "origin", "main"])`

---

# Verification

1. **Start services**:
   ```bash
   RESCAN_INTERVAL_MS=60000 CIRCUIT_BREAKER_THRESHOLD=3 RUN_MODE=all pnpm dev
   ```

2. **Test periodic rescan**:
   - Register a repository
   - Wait for initial snapshot → status = `synced`
   - Wait for rescan interval
   - Verify repo is picked up for rescan

3. **Test circuit breaker**:
   - Register a non-existent GitHub repo
   - Verify `consecutive_failures` increments
   - After threshold → verify `circuit_open_until` is set
   - Wait for cooldown → verify half-open retry

4. **Verify DB state**:
   ```bash
   docker exec -it docora-postgres psql -U docora -d docora -c \
     "SELECT repository_id, consecutive_failures, circuit_open_until FROM repositories;"
   ```
