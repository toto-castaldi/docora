---
phase: 12-app-deletion-backend
plan: 02
subsystem: workers
tags: [bullmq, snapshot-worker, app-deletion, existence-guard]

# Dependency graph
requires:
  - phase: 12-app-deletion-backend
    provides: "App deletion cascade service (Plan 01)"
provides:
  - "findAppById repository function for lightweight app existence checks"
  - "Snapshot worker app-existence guard before notification phase"
  - "Tests verifying clean job abort on deleted app"
affects: [snapshot-worker, app-deletion]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Worker pre-commit existence check pattern (query before side effects)"]

key-files:
  created:
    - tests/workers/snapshot-worker-guard.test.ts
  modified:
    - src/repositories/apps.ts
    - src/workers/snapshot.worker.ts

key-decisions:
  - "Guard placed after scan/change-detection but before notifications -- avoids wasted webhooks while keeping harmless read operations"
  - "Guard uses return (not throw) for BullMQ clean completion -- no retry loop for deleted apps"

patterns-established:
  - "Worker existence guard: check entity existence before committing side effects (notifications, DB writes)"

requirements-completed: [DEL-02]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 12 Plan 02: Worker App-Existence Guard Summary

**Snapshot worker checks app existence before sending notifications, using findAppById with clean return on deletion to avoid BullMQ retry loops**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T13:01:50Z
- **Completed:** 2026-02-25T13:05:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `findAppById` lightweight existence check to apps repository (single column, no joins)
- Inserted app-existence guard in snapshot worker between change detection and notification phase
- Guard uses clean `return` (not `throw`) so BullMQ treats the job as completed, preventing retry loops
- 3 focused tests verify: clean abort on deletion, normal flow when app exists, no retry on deletion

## Task Commits

Each task was committed atomically:

1. **Task 1: Add findAppById repository function and worker existence guard** - `a7ee1c9` (feat)
2. **Task 2: Write tests for worker existence guard and findAppById** - `5a65794` (test)

## Files Created/Modified
- `src/repositories/apps.ts` - Added `findAppById` function for lightweight app existence check
- `src/workers/snapshot.worker.ts` - Added app-existence guard before notification phase (import + guard block)
- `tests/workers/snapshot-worker-guard.test.ts` - 3 tests for worker guard behavior (abort, proceed, no-retry)

## Decisions Made
- Guard placed after scan/change-detection but before notifications: scan results are harmless in-memory data; only notifications and DB writes are skipped
- Guard uses `return` (not `throw`): per CONTEXT.md locked decision, clean completion prevents BullMQ retry loop for deleted apps

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- BullMQ Worker mock needed class syntax (not arrow function) to support `new Worker()` constructor call in tests -- resolved by using a `class MockWorker` in the mock factory
- Pre-existing uncommitted test files from Plan 01 (`tests/services/app-deletion.test.ts`, `tests/routes/admin/delete-app.test.ts`) have failures unrelated to this plan's changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Worker guard is in place for in-flight job handling during app deletion
- Plan 01 (deletion cascade service + admin route) provides the deletion endpoint
- Together they complete the app deletion backend feature (Phase 12)

## Self-Check: PASSED

All files verified present. All commits verified in git history.

---
*Phase: 12-app-deletion-backend*
*Completed: 2026-02-25*
