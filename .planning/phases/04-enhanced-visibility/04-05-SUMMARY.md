---
phase: 04-enhanced-visibility
plan: 05
subsystem: ui
tags: [react, pagination, filtering, sorting, search, datatable, e2e-verification, bug-fixes]

# Dependency graph
requires:
  - phase: 04-01
    provides: Server-side pagination API, paginateQuery helper, query parameter parser
  - phase: 04-02
    provides: DataTable, Pagination, FilterBar, FilterChips shared components
  - phase: 04-03
    provides: Apps, Repositories, Notifications page rewrites with DataTable
  - phase: 04-04
    provides: Queue and AppDetail client-side filtering/sorting
provides:
  - Verified end-to-end Enhanced Visibility across all dashboard pages
  - Bug fixes for pagination count queries, page size options, and filter clear behavior
affects: [05-monitoring-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [scalar subqueries for correlated counts, userTypedRef pattern for debounce-safe external clear]

key-files:
  modified:
    - src/repositories/pagination.ts
    - src/repositories/admin-dashboard-lists.ts
    - src/routes/admin/query-params.ts
    - dashboard/src/components/Pagination.tsx
    - dashboard/src/components/FilterBar.tsx

key-decisions:
  - "Scalar subqueries instead of LEFT JOIN + GROUP BY for accurate pagination counts"
  - "clearOrderBy() before count queries to avoid aggregate alias errors"
  - "userTypedRef pattern to distinguish user input from external prop sync in debounced search"

patterns-established:
  - "Correlated scalar subquery pattern: use eb.selectFrom().whereRef().select(countAll) for per-row counts in paginated queries"
  - "Debounce guard pattern: useRef flag to track whether state change originated from user input vs external prop update"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 4 Plan 5: Enhanced Visibility Verification Summary

**End-to-end verification of search, filter, sort, and pagination across all 5 dashboard pages, with 5 bug fixes for pagination counts, page sizes, and filter clear behavior**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T21:14:47Z
- **Completed:** 2026-02-13T21:19:47Z
- **Tasks:** 1 (human-verify checkpoint)
- **Files modified:** 5

## Accomplishments
- All 5 dashboard pages verified with functional search, filter, sort, and pagination
- Fixed critical pagination count bug where LEFT JOIN + GROUP BY produced incorrect totals
- Fixed count query failure when ORDER BY referenced aggregate aliases
- Added smaller page sizes (5, 10) to both backend whitelist and frontend dropdown
- Fixed "Clear all filters" race condition where debounced search re-applied old value after external clear

## Task Commits

Each task was committed atomically:

1. **Task 1: Human verification + bug fixes** - `7cdfa75` (fix)

## Files Created/Modified
- `src/repositories/pagination.ts` - Added clearOrderBy() before count query to avoid aggregate alias errors in ORDER BY
- `src/repositories/admin-dashboard-lists.ts` - Replaced LEFT JOIN + GROUP BY with scalar subqueries for accurate per-app repository and failed counts
- `src/routes/admin/query-params.ts` - Added 5 and 10 to ALLOWED_LIMITS whitelist
- `dashboard/src/components/Pagination.tsx` - Added 5 and 10 to PAGE_SIZES dropdown options
- `dashboard/src/components/FilterBar.tsx` - Added userTypedRef guard to prevent debounced search from re-applying old value after external clear

## Decisions Made
- Used scalar subqueries instead of LEFT JOIN + GROUP BY for listAppsWithCounts: avoids count inflation from joined rows and eliminates need for GROUP BY (which conflicts with paginateQuery's count wrapper)
- Added clearOrderBy() to paginateQuery's count path: ORDER BY is meaningless for count queries and fails when referencing aggregate aliases not present after clearSelect()
- userTypedRef pattern chosen over alternatives (e.g., clearing debounce timer) for FilterBar: simpler, no timer management, works with React's batched state updates

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] paginateQuery count query failed on ORDER BY with aggregate aliases**
- **Found during:** Task 1 (human verification)
- **Issue:** When baseQuery had orderBy referencing an aggregate alias (e.g., `repository_count`), clearSelect() removed the alias but ORDER BY still referenced it, causing SQL error
- **Fix:** Added clearOrderBy() after clearSelect() in paginateQuery count path
- **Files modified:** src/repositories/pagination.ts
- **Verification:** Paginated queries with sort by aggregate columns work correctly
- **Committed in:** 7cdfa75

**2. [Rule 1 - Bug] listAppsWithCounts returned inflated counts due to LEFT JOIN + GROUP BY**
- **Found during:** Task 1 (human verification)
- **Issue:** LEFT JOIN on app_repositories produced multiple rows per app, and COUNT() counted joined rows instead of unique repositories. GROUP BY also conflicted with paginateQuery's count wrapper
- **Fix:** Replaced LEFT JOIN + GROUP BY with correlated scalar subqueries for repository_count and failed_notification_count
- **Files modified:** src/repositories/admin-dashboard-lists.ts
- **Verification:** Apps page shows correct repository and failed counts matching actual data
- **Committed in:** 7cdfa75

**3. [Rule 1 - Bug] Backend rejected page sizes 5 and 10**
- **Found during:** Task 1 (human verification)
- **Issue:** ALLOWED_LIMITS only contained [20, 50, 100], rejecting smaller page sizes useful for testing and small datasets
- **Fix:** Added 5 and 10 to ALLOWED_LIMITS array
- **Files modified:** src/routes/admin/query-params.ts
- **Verification:** Backend accepts limit=5 and limit=10 query parameters
- **Committed in:** 7cdfa75

**4. [Rule 1 - Bug] Frontend PAGE_SIZES dropdown missing 5 and 10**
- **Found during:** Task 1 (human verification)
- **Issue:** Pagination component only offered [20, 50, 100] page sizes, inconsistent with backend after fix #3
- **Fix:** Added 5 and 10 to PAGE_SIZES array
- **Files modified:** dashboard/src/components/Pagination.tsx
- **Verification:** Dropdown shows 5, 10, 20, 50, 100 options
- **Committed in:** 7cdfa75

**5. [Rule 1 - Bug] "Clear all filters" button broken by debounce race condition**
- **Found during:** Task 1 (human verification)
- **Issue:** When clearAllFilters set search="" externally, the debounced old value still fired after the clear, re-applying the previous search term
- **Fix:** Added userTypedRef to track whether rawSearch changes originated from user typing vs external prop sync; only propagate debounced value when user typed
- **Files modified:** dashboard/src/components/FilterBar.tsx
- **Verification:** Clear all filters immediately clears search and does not re-apply old value
- **Committed in:** 7cdfa75

---

**Total deviations:** 5 auto-fixed (5 bugs via Rule 1)
**Impact on plan:** All fixes were correctness bugs discovered during human verification. No scope creep. All existing functionality preserved.

## Issues Encountered
None beyond the bugs documented above.

## User Setup Required

None - no external service configuration required.

## Phase 4 Completion Summary

Phase 4 (Enhanced Visibility) complete. All must_haves verified:

| Criteria | Status |
|----------|--------|
| Admin can search apps by name or URL | Verified |
| Admin can filter repositories by monitoring status | Verified |
| Admin can sort tables by relevant columns | Verified |
| Large lists are paginated with reasonable page sizes | Verified |
| Filter/search/sort state persists in URL across refresh | Verified |

## Next Phase Readiness
- All Enhanced Visibility features operational across all 5 dashboard pages
- URL state persistence verified (filter/search/sort/page survive refresh and share)
- Existing Phase 3 actions (retry, resync, bulk operations) remain fully functional
- Ready for Phase 5: Monitoring Dashboard

## Self-Check: PASSED

All files verified present. Commit 7cdfa75 verified in git log. SUMMARY.md created successfully.

---
*Phase: 04-enhanced-visibility*
*Completed: 2026-02-13*
