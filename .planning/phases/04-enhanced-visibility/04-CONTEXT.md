# Phase 4: Enhanced Visibility - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can efficiently navigate large datasets through search, filtering, sorting, and pagination across all dashboard pages. This phase adds data navigation controls to existing pages — no new pages or capabilities are introduced.

</domain>

<decisions>
## Implementation Decisions

### Search & Filter UX
- Collapsible filter panel: compact bar with a "Filters" button that expands to show all filter options
- Single search box per page that searches across all relevant fields (e.g., name + URL for apps)
- Filter/search state synced to URL query params — bookmarkable, shareable, survives refresh
- Apply behavior: Claude's Discretion (instant apply vs. apply button based on data volume)

### Pagination
- Server-side pagination: API accepts page/limit params, returns paginated results with total count
- Default page size: 20 items
- User-selectable page size: 20 / 50 / 100 dropdown
- Pagination style: Claude's Discretion (page numbers vs. load more, per page context)

### Sorting
- Server-side sorting: API handles sort_by and sort_order params
- Clickable column headers cycling: unsorted → ascending → descending → unsorted
- Single column sort only (no multi-column)
- Default sort: newest first (by timestamp) on all pages where applicable

### Data Density & Layout
- Filtered empty state: "No results match your filters" with a "Clear all filters" button
- Table/card layout unification: Claude's Discretion (pick what makes sorting/filtering easiest)

### Claude's Discretion
- Filter apply behavior (instant vs. apply button)
- Pagination style per page (page numbers vs. load more)
- Whether to show active filter chips above table or only in the panel
- Whether to show total result count always or only when filtered
- Whether to unify all pages to tables or keep mixed card/table layouts
- Visual sort indicators on column headers

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-enhanced-visibility*
*Context gathered: 2026-02-08*
