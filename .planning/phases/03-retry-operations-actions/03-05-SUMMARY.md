---
phase: 03-retry-operations-actions
plan: 05
subsystem: api, ui
tags: [resync, bullmq, react, confirmation-dialog, bulk-progress]

# Dependency graph
requires:
  - phase: 03-03
    provides: "Bulk progress tracking (createProgress, incrementProgress, isCancelled)"
  - phase: 03-04
    provides: "ConfirmDialog, BulkProgress components, bulkRetryByApp API"
provides:
  - "resyncSingle and resyncByApp backend service functions"
  - "POST /admin/api/resync and /admin/api/resync/app/:appId endpoints"
  - "Re-sync buttons on Repositories and AppDetail pages"
  - "useAppActions hook for retry/resync state management"
affects: [03-06, future admin dashboard enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useAppActions custom hook for extracting page action logic"
    - "window.confirm for simple single-item confirmation (Repositories page)"
    - "ConfirmDialog for bulk operations with impact warnings"

key-files:
  created:
    - "dashboard/src/hooks/useAppActions.ts"
    - "dashboard/src/pages/AppDetailRepoTable.tsx"
  modified:
    - "src/services/admin-actions.ts"
    - "src/routes/admin/dashboard-actions.ts"
    - "packages/shared-types/src/dashboard.ts"
    - "src/routes/admin/dashboard-api.ts"
    - "dashboard/src/api/admin.ts"
    - "dashboard/src/pages/Repositories.tsx"
    - "dashboard/src/pages/Repositories.module.css"
    - "dashboard/src/pages/AppDetail.tsx"
    - "dashboard/src/pages/AppDetail.module.css"

key-decisions:
  - "resyncAndQueue uses isRescan: false since deliveries are cleared (treated as initial scan)"
  - "Extracted useAppActions hook and AppDetailRepoTable component from AppDetail to honor 150-line rule"
  - "window.confirm for single repo resync on Repositories page (avoids ConfirmDialog import during parallel plan execution)"
  - "Indigo (#6366f1) color for resync buttons to distinguish from amber retry buttons"
  - "RepositorySummary app_id made optional to maintain backward compatibility"

patterns-established:
  - "useAppActions: extract action state + mutations from page components"
  - "resyncAndQueue: clearDeliveries + reset + queue pattern for re-sync operations"

# Metrics
duration: 7min
completed: 2026-02-07
---

# Phase 3 Plan 5: Re-sync Operations Summary

**Force re-sync backend and frontend: clears deliveries, queues fresh snapshot, with confirmation dialogs and bulk progress tracking**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T11:10:08Z
- **Completed:** 2026-02-07T11:17:29Z
- **Tasks:** 2
- **Files modified:** 11 (2 created, 9 modified)

## Accomplishments
- Backend resyncSingle and resyncByApp functions that clear deliveries and queue fresh snapshot jobs
- POST /admin/api/resync and /admin/api/resync/app/:appId endpoints with proper error handling
- Re-sync button on every repository row in both Repositories and AppDetail pages
- "Re-sync All Repos" bulk button on AppDetail with BulkProgress tracking
- Extracted useAppActions hook and AppDetailRepoTable component for code organization

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-sync backend service functions and endpoints** - `a362673` (feat)
2. **Task 2: Re-sync frontend UI on Repositories and AppDetail pages** - `4d4f6e0` (feat)

## Files Created/Modified
- `src/services/admin-actions.ts` - Added resyncSingle, resyncByApp, resyncAndQueue, fetchAppRows, processBulkResyncs
- `src/routes/admin/dashboard-actions.ts` - Added POST /admin/api/resync and /admin/api/resync/app/:appId
- `packages/shared-types/src/dashboard.ts` - Added app_id? to RepositorySummary
- `src/routes/admin/dashboard-api.ts` - Added app_id to repositories endpoint mapping
- `dashboard/src/api/admin.ts` - Added resyncRepository and resyncByApp API functions
- `dashboard/src/hooks/useAppActions.ts` - Custom hook for retry/resync actions (new)
- `dashboard/src/pages/AppDetailRepoTable.tsx` - Repository table with StatusBadge and action buttons (new)
- `dashboard/src/pages/Repositories.tsx` - Added Actions column with Re-sync button per row
- `dashboard/src/pages/Repositories.module.css` - Added resyncButton styles
- `dashboard/src/pages/AppDetail.tsx` - Refactored to use useAppActions and AppDetailRepoTable
- `dashboard/src/pages/AppDetail.module.css` - Added resyncButton, resyncAllButton, actionsCell styles

## Decisions Made
- **resyncAndQueue isRescan: false** - Since deliveries are cleared, the re-sync is effectively an initial scan. Files will all be detected as "new" and sent to the client.
- **Extracted useAppActions hook** - AppDetail was growing past 380 lines with retry + resync. Extracted all mutation/state logic into a hook and the table into a sub-component.
- **window.confirm for Repositories page** - Single repo resync on Repositories page uses native confirm() since the ConfirmDialog component was being created in parallel by Plan 03-04. AppDetail uses ConfirmDialog for bulk operations since 03-04 had completed by execution time.
- **Indigo color for resync vs amber for retry** - Visual distinction between "re-send everything" (resync, more impactful) and "retry failed" operations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Code Quality] Split AppDetail.tsx into 3 files for 150-line rule**
- **Found during:** Task 2
- **Issue:** AppDetail.tsx grew to 382 lines with retry + resync mutations, handlers, and UI
- **Fix:** Extracted useAppActions hook (117 lines) and AppDetailRepoTable component (136 lines), reducing AppDetail to 191 lines
- **Files created:** dashboard/src/hooks/useAppActions.ts, dashboard/src/pages/AppDetailRepoTable.tsx
- **Verification:** All builds pass, same functionality
- **Committed in:** 4d4f6e0

---

**Total deviations:** 1 auto-fixed (code quality / 150-line rule)
**Impact on plan:** Improved code organization. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Re-sync operations complete, available from both Repositories and AppDetail pages
- Progress tracking reuses existing infrastructure from Plan 03-03
- Ready for Plan 03-06 (remaining phase 3 work)

## Self-Check: PASSED

---
*Phase: 03-retry-operations-actions*
*Completed: 2026-02-07*
