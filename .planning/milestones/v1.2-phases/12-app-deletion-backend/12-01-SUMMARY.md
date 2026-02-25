---
phase: 12-app-deletion-backend
plan: 01
subsystem: api
tags: [kysely, bullmq, fastify, cascade-delete, admin]

# Dependency graph
requires:
  - phase: 10-repo-lock
    provides: withRepoLock for safe filesystem operations
  - phase: 11-onboarding-lockdown
    provides: admin session auth pattern for routes
provides:
  - deleteApp() orchestrator service with transaction cascade
  - DELETE /admin/api/apps/:appId admin endpoint
  - closeDeleteQueue() for graceful shutdown
affects: [13-app-deletion-frontend, admin-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [transaction-based cascade delete, post-transaction orphan cleanup, proactive BullMQ job removal]

key-files:
  created:
    - src/services/app-deletion.ts
    - src/routes/admin/delete-app.ts
    - tests/services/app-deletion.test.ts
    - tests/routes/admin/delete-app.test.ts
  modified:
    - src/routes/admin/index.ts

key-decisions:
  - "200 with summary body instead of 204 to give admin dashboard feedback to display"
  - "BullMQ Queue singleton per service file following admin-actions.ts pattern"
  - "Route tests set ADMIN_SESSION_SECRET to test actual auth flow through global admin-auth hook"

patterns-established:
  - "Transaction cascade delete: FK-safe order (children first) inside Kysely transaction, orphan cleanup outside"
  - "Best-effort post-transaction cleanup: log errors and continue for disk/queue operations"

requirements-completed: [DEL-01]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 12 Plan 01: App Deletion Backend Summary

**DELETE /admin/api/apps/:appId with Kysely transaction cascade, post-transaction orphan cleanup, and proactive BullMQ job removal**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T13:01:55Z
- **Completed:** 2026-02-25T13:06:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `deleteApp()` service with FK-safe cascade delete inside a single Kysely transaction (deliveries, app_repositories, apps)
- Post-transaction orphan cleanup: orphaned repositories removed from DB and disk with best-effort error handling
- Proactive BullMQ pending job removal for deleted app's repositories
- Session-authenticated DELETE route registered in admin route tree
- 8 new tests (5 service + 3 route) covering all deletion scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Create app deletion service and admin route** - `01f8278` (feat)
2. **Task 2: Write tests for deletion service and route** - `2e59153` (test)

## Files Created/Modified
- `src/services/app-deletion.ts` - deleteApp() orchestrator with transaction cascade + orphan cleanup + BullMQ job removal
- `src/routes/admin/delete-app.ts` - DELETE /admin/api/apps/:appId route with session auth
- `src/routes/admin/index.ts` - Register deleteAppRoute in admin route tree
- `tests/services/app-deletion.test.ts` - 5 unit tests for deletion service
- `tests/routes/admin/delete-app.test.ts` - 3 integration tests for route auth

## Decisions Made
- Used 200 OK with summary body `{ data: { deleted, repositories_unlinked, orphaned_repositories_cleaned } }` instead of 204 No Content, so the admin dashboard (Phase 13) has actionable feedback to display
- BullMQ Queue singleton follows the same lazy-init pattern as admin-actions.ts with a separate `closeDeleteQueue()` for graceful shutdown
- Route tests dynamically set `ADMIN_SESSION_SECRET` to test the actual global admin auth hook behavior (503 vs 401)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- BullMQ `Queue` mock needed `class MockQueue` syntax instead of `vi.fn().mockImplementation()` because Vitest ESM mocks require proper constructor functions for `new` operator
- Route tests initially got 503 because `ADMIN_SESSION_SECRET` was not set in test env -- the global admin-auth hook returns 503 before route-level auth. Solved by setting the env var before building the test server.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- DELETE endpoint ready for Phase 13 (admin dashboard UI) to wire up
- Worker already has app-existence guard (from prior work) to handle in-flight jobs for deleted apps
- `closeDeleteQueue()` exported for graceful shutdown integration

## Self-Check: PASSED

- All 4 created files verified on disk
- Commit `01f8278` (feat) verified in git log
- Commit `2e59153` (test) verified in git log
- TypeScript compiles without errors
- All 82 tests pass (including 8 new)

---
*Phase: 12-app-deletion-backend*
*Completed: 2026-02-25*
