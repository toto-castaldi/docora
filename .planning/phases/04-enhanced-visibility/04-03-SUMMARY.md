---
phase: 04-enhanced-visibility
plan: 03
subsystem: ui
tags: [react, datatable, pagination, search, sort, filter, url-state]

# Dependency graph
requires:
  - phase: 04-01
    provides: server-side pagination API with sort whitelists and ILIKE search
  - phase: 04-02
    provides: DataTable, Pagination, FilterBar, FilterChips components and useTableParams hook
provides:
  - Apps page with searchable sortable paginated table
  - Repositories page with search, status filter, sortable columns, pagination
  - Notifications page with sortable table, search, retry actions, pagination
affects: [04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [page-level sort cycling, dual empty states, keepPreviousData transitions]

key-files:
  modified:
    - dashboard/src/pages/Apps.tsx
    - dashboard/src/pages/Apps.module.css
    - dashboard/src/pages/Repositories.tsx
    - dashboard/src/pages/Repositories.module.css
    - dashboard/src/pages/Notifications.tsx
    - dashboard/src/pages/Notifications.module.css

key-decisions:
  - "Sort cycling pattern: different column=asc, same+asc=desc, same+desc=clear to defaults"
  - "Repositories page omits App column (RepositorySummary type lacks app_name field)"
  - "Retry All count uses pagination.total for accurate cross-page count"
  - "Column definitions extracted to separate functions for readability"

patterns-established:
  - "Page sort handler: three-state cycling (asc->desc->clear) via updateParams"
  - "Dual empty state pattern: no-data vs no-matching-filters with clearAllFilters button"
  - "Column definitions as functions (useXxxColumns) for separation from page logic"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 4 Plan 3: Page Rewrites Summary

**Apps, Repositories, Notifications pages rewritten with shared DataTable, FilterBar, Pagination components and URL-synced state**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T11:16:33Z
- **Completed:** 2026-02-08T11:21:15Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Apps page converted from card grid to searchable, sortable, paginated table
- Repositories page enhanced with status dropdown filter, search, sort, pagination (replacing manual HTML table)
- Notifications page converted from card list to table with search, sort, pagination while preserving single retry, bulk retry, and BulkProgress functionality
- All three pages use URL-synced state that survives page refresh
- Dual empty states on all pages: "no data" vs "no results match your filters"

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite Apps page** - `74d3b26` (feat)
2. **Task 2: Rewrite Repositories page** - `0135b52` (feat)
3. **Task 3: Rewrite Notifications page** - `71cf683` (feat)

## Files Created/Modified
- `dashboard/src/pages/Apps.tsx` - Table with sort, search, pagination replacing card grid
- `dashboard/src/pages/Apps.module.css` - Removed card styles, added appLink/failedCount/urlCell/clearButton
- `dashboard/src/pages/Repositories.tsx` - Table with sort, search, status filter, pagination, resync actions
- `dashboard/src/pages/Repositories.module.css` - Removed manual table styles, added clearButton
- `dashboard/src/pages/Notifications.tsx` - Table with sort, search, pagination, retry/bulk retry actions
- `dashboard/src/pages/Notifications.module.css` - Removed card styles, added errorCell/repoLink/appLink/clearButton

## Decisions Made
- Sort cycling delegated to parent pages (matching 04-02 decision): asc -> desc -> clear defaults
- Omitted "App" column from Repositories table since RepositorySummary type lacks app_name field (would require backend schema change)
- Notifications "Retry All" button uses pagination.total (server-side total count) instead of current page length for accurate count
- Column definitions extracted to functions (useAppsColumns, useRepoColumns, useNotificationColumns) for separation of concerns and readability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Omitted App column from Repositories table**
- **Found during:** Task 2 (Repositories page rewrite)
- **Issue:** Plan specified an "App" column (key: 'app_name') for Repositories, but RepositorySummary type has no app_name field. Adding it requires backend DB query changes (architectural).
- **Fix:** Omitted the App column. The repository page still shows Repository, Status, Last Scanned, and Actions columns.
- **Files modified:** dashboard/src/pages/Repositories.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 0135b52 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking - type mismatch)
**Impact on plan:** Minor - one column omitted due to missing type field. No scope creep. Can be added later if RepositorySummary is extended.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three main list pages now use server-side pagination with shared components
- Ready for Plan 4 (activity timeline) and Plan 5 (additional enhancements)
- If app_name column is desired on Repositories, RepositorySummary type and backend query need extension

## Self-Check: PASSED

All 6 files exist. All 3 task commits verified (74d3b26, 0135b52, 71cf683). TypeScript compiles cleanly.

---
*Phase: 04-enhanced-visibility*
*Completed: 2026-02-08*
