---
phase: 02-dashboard-core-display
plan: 03
execution_date: 2026-01-29
subsystem: admin-api
tags: [bullmq, queue, api, fastify, kysely]
dependencies:
  requires: ["02-01"]
  provides: ["queue-status-api", "failed-notifications-api", "overview-api"]
  affects: ["02-04", "02-05"]
tech_stack:
  added: []
  patterns: ["service-layer", "repository-pattern", "typed-api-responses"]
key_files:
  created:
    - src/services/queue-status.ts
    - src/routes/admin/dashboard-api.ts
  modified:
    - src/repositories/admin-dashboard.ts
    - src/routes/admin/index.ts
    - package.json
decisions:
  - id: "02-03-01"
    decision: "Lazy-initialize BullMQ Queue connection in queue-status service"
    reason: "Avoid creating Redis connections during module load, only when needed"
metrics:
  duration: "4.5 min"
  completed: 2026-01-29
---

# Phase 02 Plan 03: Dashboard Backend APIs Summary

Queue status service with BullMQ queue access, and dashboard API endpoints for queue, failed notifications, and overview metrics.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create queue status service | a2e8b6c | src/services/queue-status.ts |
| 2 | Add failed notifications and overview queries | 95e3d44 | src/repositories/admin-dashboard.ts |
| 3 | Add queue, notifications, and overview API routes | 0344584 | src/routes/admin/dashboard-api.ts, src/routes/admin/index.ts, package.json |

## Implementation Details

### Queue Status Service (`src/services/queue-status.ts`)

Wraps BullMQ queue methods with typed interfaces:
- `getQueueStatus()` - Returns job counts by status (waiting, active, completed, failed, delayed)
- `getQueueJobs(limit)` - Returns list of waiting, active, and delayed jobs with metadata
- `closeQueueConnection()` - Cleanup function for graceful shutdown

Uses lazy initialization pattern - Queue instance is created on first use.

### Repository Layer Additions (`src/repositories/admin-dashboard.ts`)

Added two new query functions:
- `listFailedNotifications()` - Queries app_repositories with status='failed', joins to get app and repo details
- `getOverviewCounts()` - Parallel queries for total apps, total repositories, and failed count

### API Routes (`src/routes/admin/dashboard-api.ts`)

Six endpoints protected by session authentication:
- `GET /admin/api/apps` - List apps with repository and failure counts
- `GET /admin/api/apps/:appId` - App detail with linked repositories
- `GET /admin/api/repositories` - All repositories with status
- `GET /admin/api/queue` - Queue status counts and job list
- `GET /admin/api/notifications/failed` - Failed notifications with error details
- `GET /admin/api/overview` - Dashboard overview metrics

All endpoints return 401 for unauthenticated requests via `onRequest` hook.

## Key Code Snippets

**Queue status service initialization:**
```typescript
let queue: Queue<SnapshotJobData> | null = null;

function getQueue(): Queue<SnapshotJobData> {
  if (!queue) {
    queue = new Queue<SnapshotJobData>(SNAPSHOT_QUEUE_NAME, {
      connection: { url: getRedisUrl(), ...getRedisOptions() },
    });
  }
  return queue;
}
```

**Overview endpoint combining DB and queue data:**
```typescript
const [counts, queueStatus] = await Promise.all([
  getOverviewCounts(),
  getQueueStatus(),
]);

const response: OverviewMetrics = {
  total_apps: counts.total_apps,
  total_repositories: counts.total_repositories,
  failed_notifications: counts.failed_notifications,
  queue_waiting: queueStatus.waiting,
  queue_active: queueStatus.active,
};
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 02-02 artifacts not executed**

- **Found during:** Task 3
- **Issue:** Plan 02-03 expected admin-dashboard.ts and dashboard-api.ts to exist from 02-02, but those files were only staged, not committed
- **Fix:** The staged files were included in Task 1 commit, then updated in subsequent tasks
- **Files modified:** src/repositories/admin-dashboard.ts, src/routes/admin/dashboard-api.ts, src/routes/admin/index.ts

## Verification Results

- `pnpm typecheck` - Pass
- `pnpm build` - Pass
- All endpoints registered under /admin/api/
- All endpoints require session authentication

## Next Phase Readiness

Ready for 02-04 (Frontend pages) - all backend APIs are now available:
- Apps list and detail endpoints
- Repositories list endpoint
- Queue status and jobs endpoint
- Failed notifications endpoint
- Overview metrics endpoint
