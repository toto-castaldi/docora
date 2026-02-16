---
phase: 08-failure-notifications
plan: 01
subsystem: api
tags: [webhook, hmac, circuit-breaker, notifications, bullmq]

# Dependency graph
requires:
  - phase: 04-circuit-breaker
    provides: "recordGitFailure with circuitOpened boolean in snapshot worker"
  - phase: 03-notifications
    provides: "HMAC-signed webhook pattern (generateSignedHeaders, notifier.ts)"
provides:
  - "sync_failed webhook notification service (failure-notifier.ts)"
  - "findAppsWatchingRepository data access query"
  - "NotificationEndpoint type includes sync_failed"
affects: [08-02-docs-update, future-notification-types]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fire-and-forget notification from worker", "per-repository app lookup for broadcast"]

key-files:
  created: ["src/services/failure-notifier.ts"]
  modified: ["src/services/notifier.ts", "src/repositories/repositories.ts", "src/workers/snapshot.worker.ts"]

key-decisions:
  - "Fire-and-forget pattern: sync_failed notifications never block the worker or disrupt BullMQ retry"
  - "Circuit breaker env vars read directly in worker rather than importing from repositories.ts to avoid coupling"
  - "Sequential app notification (for-of loop) to avoid overwhelming client endpoints"
  - "10s timeout for sync_failed POST vs 30s for file notifications (failure notifications are lightweight)"

patterns-established:
  - "Broadcast notification pattern: query all apps watching a repository, send to each"
  - "Fire-and-forget with .catch(): use for best-effort notifications that must not block critical paths"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 8 Plan 1: Sync Failed Notification Service Summary

**HMAC-signed sync_failed webhook notifications sent to all watching apps when circuit breaker opens, using fire-and-forget pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T10:24:37Z
- **Completed:** 2026-02-15T10:26:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created failure-notifier service that sends HMAC-signed sync_failed webhooks to all apps watching a repository
- Added findAppsWatchingRepository data access query joining app_repositories and apps tables
- Wired sync_failed notifications into snapshot worker, triggered only when circuit breaker opens
- Fire-and-forget pattern ensures notifications never block worker execution or BullMQ retry

## Task Commits

Each task was committed atomically:

1. **Task 1: Create failure-notifier service and data access query** - `5c5f43f` (feat)
2. **Task 2: Wire failure-notifier into snapshot worker on circuit breaker open** - `71078a8` (feat)

## Files Created/Modified
- `src/services/failure-notifier.ts` - New service: builds SyncFailedPayload, queries watching apps, sends signed POST to each app's /sync_failed endpoint
- `src/services/notifier.ts` - Added "sync_failed" to NotificationEndpoint type union
- `src/repositories/repositories.ts` - Added findAppsWatchingRepository query (app_id, app_name, base_url, client_auth_key_encrypted, retry_count)
- `src/workers/snapshot.worker.ts` - Calls sendSyncFailedNotification when circuitOpened is true, fire-and-forget with .catch()

## Decisions Made
- Fire-and-forget pattern: sync_failed notifications are best-effort, never block the worker or disrupt BullMQ retry mechanism
- Circuit breaker env vars (CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_COOLDOWN_MS) read directly in worker rather than importing from repositories.ts — conscious trade-off: slight duplication vs unnecessary coupling
- Sequential notification delivery (for-of loop) to avoid overwhelming client endpoints
- 10s timeout for sync_failed POST (shorter than 30s file notification timeout since payloads are small)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- sync_failed notification pipeline is complete and ready for use
- Plan 08-02 (docs update) can proceed to document the new webhook endpoint
- Future notification types can follow the same pattern established here

## Self-Check: PASSED

All files exist, all commits verified, all exports confirmed.

---
*Phase: 08-failure-notifications*
*Completed: 2026-02-15*
