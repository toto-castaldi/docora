# Phase 4: Enhanced Visibility - Research

**Researched:** 2026-02-08
**Domain:** Server-side pagination, filtering, sorting for admin dashboard (Fastify + Kysely backend, React + TanStack Query frontend)
**Confidence:** HIGH

## Summary

This phase adds data navigation controls (search, filter, sort, pagination) to the existing admin dashboard. The codebase currently fetches all records from the database and returns them as unbounded arrays. Every API endpoint (`/admin/api/apps`, `/admin/api/repositories`, `/admin/api/notifications/failed`) needs to accept query parameters for pagination, sorting, and filtering, and return paginated responses with total counts.

The frontend uses react-router 7.13.0 (which provides `useSearchParams` for URL state sync), TanStack Query 5.90.20 (which provides `keepPreviousData` / `placeholderData` for smooth pagination transitions), and CSS Modules for styling. The current UI is a mix of card grids (Apps page) and tables (Repositories, Queue, AppDetailRepoTable). Sorting with clickable column headers requires a table layout. The Notifications page uses a card list layout.

**Primary recommendation:** Unify all list pages to table layout (cards do not support column header sorting), add a shared pagination/filter toolbar component, modify all API endpoints to accept `page`, `limit`, `sort_by`, `sort_order`, and `search` query params, and add a Kysely helper for paginated queries with total count.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Collapsible filter panel: compact bar with a "Filters" button that expands to show all filter options
- Single search box per page that searches across all relevant fields (e.g., name + URL for apps)
- Filter/search state synced to URL query params -- bookmarkable, shareable, survives refresh
- Server-side pagination: API accepts page/limit params, returns paginated results with total count
- Default page size: 20 items
- User-selectable page size: 20 / 50 / 100 dropdown
- Server-side sorting: API handles sort_by and sort_order params
- Clickable column headers cycling: unsorted -> ascending -> descending -> unsorted
- Single column sort only (no multi-column)
- Default sort: newest first (by timestamp) on all pages where applicable
- Filtered empty state: "No results match your filters" with a "Clear all filters" button

### Claude's Discretion
- Filter apply behavior (instant vs. apply button)
- Pagination style per page (page numbers vs. load more)
- Whether to show active filter chips above table or only in the panel
- Whether to show total result count always or only when filtered
- Whether to unify all pages to tables or keep mixed card/table layouts
- Visual sort indicators on column headers

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

## Discretion Recommendations

### Filter Apply Behavior: Instant Apply with Debounced Search
**Recommendation:** Use instant apply for all filters (dropdowns apply immediately on change) and debounce the search text input by 300ms. The data volumes for an admin dashboard are small (tens to low hundreds of records), so there is no performance reason to batch filter changes behind an "Apply" button. Instant feedback is better UX for admin tools.

### Pagination Style: Page Numbers on All Pages
**Recommendation:** Use numbered page navigation everywhere. "Load more" is better for infinite scroll / consumer UX. Admin dashboards benefit from deterministic page positions (page 3 of 7) so the user knows exactly where they are in the dataset. This also integrates cleanly with URL params (`?page=3`).

### Active Filter Chips: Show Above Table When Any Filter Is Active
**Recommendation:** Show active filter chips (with individual remove buttons) above the table when any filter/search is active. This provides at-a-glance visibility of what's filtered without having to expand the filter panel. Include a "Clear all" button among the chips.

### Total Result Count: Show Always
**Recommendation:** Always show total result count in the pagination bar (e.g., "Showing 1-20 of 47 results"). When filtered, show both filtered count and total (e.g., "Showing 1-20 of 12 results (47 total)"). This gives the admin constant awareness of dataset size.

### Layout Unification: Convert All Pages to Tables
**Recommendation:** Convert the Apps page from card grid to table, and convert the Notifications page from card list to table. Reasons:
1. Sorting requires clickable column headers, which only work with tables
2. Pagination and sorting controls feel inconsistent across mixed layouts
3. Tables are more data-dense, which is what admins prefer
4. The existing Repositories and Queue pages already use tables

The AppDetail page's repo sub-table (AppDetailRepoTable) should also get pagination/sorting/filtering since it can contain many repositories per app.

### Visual Sort Indicators: Chevron Icons in Column Headers
**Recommendation:** Use lucide-react's `ChevronUp`, `ChevronDown`, and `ChevronsUpDown` icons next to sortable column header text. `ChevronsUpDown` for unsorted, `ChevronUp` for ascending, `ChevronDown` for descending. This is the standard pattern.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-router | 7.13.0 | `useSearchParams` for URL state sync | Already installed, provides native URLSearchParams integration |
| @tanstack/react-query | 5.90.20 | `keepPreviousData` for smooth pagination transitions | Already installed, v5 uses `placeholderData: keepPreviousData` |
| Kysely | (project version) | `limit()`, `offset()`, dynamic `orderBy()`, `ILIKE` for search | Already installed, type-safe SQL builder |
| Fastify | (project version) | Route querystring typing via generics | Already installed, route type generics support `Querystring` type |
| lucide-react | 0.563.0 | Sort indicator icons (`ChevronUp`, `ChevronDown`, `ChevronsUpDown`, `Search`, `Filter`, `X`) | Already installed |

### No New Dependencies Required
This phase requires zero new dependencies. Everything needed is available in the existing stack.

## Architecture Patterns

### Backend: Paginated Query Helper

Create a reusable Kysely helper that wraps any `SelectQueryBuilder` with pagination, sorting, and total count:

```typescript
// Source: Kysely docs - limit/offset pattern
// File: src/repositories/pagination.ts

export interface PaginationParams {
  page: number;       // 1-based
  limit: number;      // 20 | 50 | 100
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
```

The helper runs two queries: a `COUNT(*)` query and the data query with `LIMIT` + `OFFSET`. Both share the same `WHERE` clauses. The approach is straightforward:

```typescript
// Kysely pattern for offset pagination
const offset = (params.page - 1) * params.limit;

const [countResult, rows] = await Promise.all([
  baseQuery
    .select((eb) => eb.fn.countAll().as('total'))
    .executeTakeFirstOrThrow(),
  baseQuery
    .orderBy(sortColumn, sortOrder)
    .limit(params.limit)
    .offset(offset)
    .execute(),
]);
```

### Backend: Querystring Typing Pattern

Fastify routes use generic type parameters for querystring:

```typescript
// Source: Fastify TypeScript docs
interface ListQuerystring {
  page?: string;
  limit?: string;
  sort_by?: string;
  sort_order?: string;
  search?: string;
  status?: string;    // filter-specific
}

server.get<{
  Querystring: ListQuerystring;
  Reply: ApiResponse<PaginatedResult<AppSummary>> | ApiErrorResponse;
}>('/admin/api/apps', async (request, reply) => {
  const params = parseQueryParams(request.query);
  // ...
});
```

### Backend: Search with ILIKE

For text search across multiple fields, use PostgreSQL `ILIKE` with Kysely:

```typescript
// Kysely ILIKE pattern for multi-field search
if (search) {
  query = query.where((eb) =>
    eb.or([
      eb('apps.app_name', 'ilike', `%${search}%`),
      eb('apps.base_url', 'ilike', `%${search}%`),
    ])
  );
}
```

### Frontend: URL State Sync with useSearchParams

```typescript
// Source: react-router v7 docs - useSearchParams
import { useSearchParams } from 'react-router';

function useTableParams(defaults: { sortBy: string; sortOrder: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const limit = Number(searchParams.get('limit')) || 20;
  const sortBy = searchParams.get('sort_by') || defaults.sortBy;
  const sortOrder = searchParams.get('sort_order') || defaults.sortOrder;
  const search = searchParams.get('search') || '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.set('page', '1'); // reset page on filter change
    setSearchParams(next);
  };

  return { page, limit, sortBy, sortOrder, search, setParam, searchParams, setSearchParams };
}
```

### Frontend: TanStack Query with Pagination

```typescript
// Source: TanStack Query v5 docs - paginated queries
import { keepPreviousData, useQuery } from '@tanstack/react-query';

const { data, isLoading, isPlaceholderData } = useQuery({
  queryKey: ['apps', page, limit, sortBy, sortOrder, search, ...filters],
  queryFn: () => fetchApps({ page, limit, sort_by: sortBy, sort_order: sortOrder, search }),
  placeholderData: keepPreviousData,  // smooth transition, no loading flash
  refetchInterval: POLL_INTERVAL,
});
```

### Shared Types: Paginated Response

Add to `@docora/shared-types`:

```typescript
// packages/shared-types/src/dashboard.ts
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
```

### Recommended Component Structure

```
dashboard/src/
  components/
    DataTable.tsx           # Reusable table with sortable headers
    DataTable.module.css
    Pagination.tsx          # Page navigation component
    Pagination.module.css
    FilterBar.tsx           # Collapsible filter panel with search
    FilterBar.module.css
    FilterChips.tsx         # Active filter chips above table
    FilterChips.module.css
    EmptyState.tsx          # "No results" with clear filters button
  hooks/
    useTableParams.ts       # URL search params <-> table state
    usePolling.ts           # (existing, modify to accept query params in key)
  api/
    admin.ts                # (existing, modify fetch functions to accept params)
```

### Anti-Patterns to Avoid
- **Fetching all data then filtering client-side:** This defeats the purpose of server-side pagination. All filtering, sorting, and pagination must happen in SQL.
- **Separate count query without shared WHERE clauses:** The count query and data query must use identical filters, or the total count will be wrong.
- **Resetting page without resetting on filter change:** When search or filter changes, page must reset to 1. Forgetting this shows empty pages.
- **Not debouncing search input:** Typing fires a query per keystroke. Always debounce text search by 300ms before updating URL params.

## Page-by-Page Breakdown

### Apps Page (`/admin/apps`)
**Current layout:** Card grid (`auto-fill, minmax(320px, 1fr)`)
**Change to:** Table
**Search fields:** `app_name`, `base_url`
**Filters:** None needed (small dataset, search is sufficient)
**Sortable columns:** App Name (app_name), Created (created_at), Repositories (repository_count), Failed (failed_notification_count)
**Default sort:** `created_at DESC`
**API endpoint:** `GET /admin/api/apps?page=1&limit=20&sort_by=created_at&sort_order=desc&search=`

### Repositories Page (`/admin/repositories`)
**Current layout:** Table (already)
**Search fields:** `owner`, `name`, `github_url`
**Filters:** Status dropdown (synced / failed / pending_snapshot / scanning)
**Sortable columns:** Repository (name), Status (status), Last Scanned (last_scanned_at)
**Default sort:** `created_at DESC` (repositories.created_at)
**API endpoint:** `GET /admin/api/repositories?page=1&limit=20&sort_by=created_at&sort_order=desc&search=&status=`

### Notifications Page (`/admin/notifications/failed`)
**Current layout:** Card list
**Change to:** Table
**Search fields:** `app_name`, `repository_name`, `error_message`
**Filters:** None specified (could filter by retry_count range, but keep it simple)
**Sortable columns:** Repository (repository_name), App (app_name), Retries (retry_count), Time (timestamp)
**Default sort:** `last_scanned_at DESC`
**API endpoint:** `GET /admin/api/notifications/failed?page=1&limit=20&sort_by=last_scanned_at&sort_order=desc&search=`

### Queue Page (`/admin/queue`)
**Current layout:** Table for jobs, status cards for counts
**Search fields:** `app_name`, `repository_name`
**Filters:** Job status (waiting / active / delayed)
**Sortable columns:** Repository (repository_name), App (app_name), Status (status), Created (created_at)
**Note:** Queue jobs come from BullMQ Redis, not PostgreSQL. BullMQ's `getWaiting(start, end)` already supports range-based fetching. Server-side sorting is limited because BullMQ returns jobs in queue order. For the Queue page, use client-side sorting since BullMQ does not support SQL-like ORDER BY, but keep server-side pagination using BullMQ's built-in range params.
**Default sort:** Active first, then waiting, then delayed (current behavior)
**API endpoint:** `GET /admin/api/queue?page=1&limit=20&search=&status=`

### AppDetail Repositories Sub-table (`/admin/apps/:appId`)
**Current:** AppDetailRepoTable receives full array from parent
**Change:** Either paginate in the parent API response, or add a separate endpoint for paginated app repos
**Search fields:** `owner`, `name`
**Filters:** Status dropdown
**Sortable columns:** Repository (name), Status (status), Last Scanned (last_scanned_at)
**Recommendation:** Add a new endpoint `GET /admin/api/apps/:appId/repositories?page=1&limit=20&...` to avoid making the app detail endpoint overly complex. The AppDetail endpoint continues to return app metadata; repositories are fetched separately with pagination.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL state management | Custom URL parser/serializer | `useSearchParams` from react-router | Handles encoding, history integration, edge cases |
| Pagination data caching | Custom stale-while-revalidate | `placeholderData: keepPreviousData` from TanStack Query v5 | Prevents loading flash between pages, handles race conditions |
| Debounced search | Raw `setTimeout` | `useEffect` with cleanup + 300ms delay (or a simple `useDebouncedValue` hook) | Cleanup prevents stale closures, race conditions |
| SQL injection in search | String concatenation | Kysely parameterized queries (automatic) | Kysely auto-parameterizes all values |
| Sort column whitelisting | No validation | Explicit allowed-columns map per endpoint | Prevents SQL injection via sort_by param |

## Common Pitfalls

### Pitfall 1: SQL Injection via sort_by Parameter
**What goes wrong:** The `sort_by` query parameter is user-supplied. If passed directly to Kysely's `orderBy()`, a malicious user could inject SQL.
**Why it happens:** Developers trust that Kysely parameterizes everything, but column names in `ORDER BY` cannot be parameterized.
**How to avoid:** Create a whitelist map per endpoint. Validate `sort_by` against the whitelist before passing to `orderBy()`. Return 400 for invalid values.
**Warning signs:** Any `orderBy(request.query.sort_by)` without validation.

```typescript
const ALLOWED_SORT_COLUMNS = {
  app_name: 'apps.app_name',
  created_at: 'apps.created_at',
  repository_count: 'repository_count',
} as const;

const column = ALLOWED_SORT_COLUMNS[params.sort_by];
if (!column) return reply.code(400).send({ error: 'Invalid sort column' });
```

### Pitfall 2: Page Not Resetting on Filter Change
**What goes wrong:** User is on page 5, applies a filter that reduces results to 2 pages. They see an empty page.
**Why it happens:** The page param in URL stays at 5 even though the filtered dataset only has 2 pages.
**How to avoid:** Any change to search, sort, or filter params must also reset `page` to 1 in the URL.
**Warning signs:** `setSearchParams` calls that don't touch the `page` param.

### Pitfall 3: Count Query and Data Query Diverging
**What goes wrong:** The total count says 47 but the paginated results don't add up, or show different items than expected.
**Why it happens:** The WHERE clauses in the count query differ from those in the data query (e.g., filters applied to one but not the other).
**How to avoid:** Build a single base query with all WHERE clauses, then fork it into count and data queries.
**Warning signs:** Two separate query builders that each add their own WHERE clauses independently.

### Pitfall 4: ILIKE Performance on Large Tables
**What goes wrong:** Text search with `ILIKE '%term%'` does full table scans on large tables.
**Why it happens:** Leading wildcard `%` prevents index usage.
**How to avoid:** For this admin dashboard with tens to low hundreds of records, this is not a problem. If data grows beyond thousands, consider PostgreSQL `pg_trgm` extension with GIN indexes. For now, simple ILIKE is fine.
**Warning signs:** Only relevant if response times exceed 200ms.

### Pitfall 5: BullMQ Queue Cannot Be Sorted Like SQL
**What goes wrong:** Trying to apply SQL-like sorting to BullMQ queue jobs fails because BullMQ stores jobs in Redis sorted sets with timestamp-based ordering.
**Why it happens:** BullMQ's `getWaiting(start, end)` returns jobs in insertion order. There is no way to sort by arbitrary fields server-side.
**How to avoid:** For the Queue page, fetch all current jobs (already limited to 50) and sort/filter client-side. Queue jobs are ephemeral and small in number, making this acceptable.
**Warning signs:** Attempting to build server-side sort for BullMQ jobs.

### Pitfall 6: Polling + Pagination Conflict
**What goes wrong:** The polling (refetchInterval: 10s) refetches the current page, which may shift if records were added/removed between polls. User sees items appear/disappear.
**Why it happens:** Offset-based pagination is not stable when the underlying data changes.
**How to avoid:** This is acceptable for an admin dashboard. The data does not change rapidly enough to cause significant issues. Using `keepPreviousData` from TanStack Query smooths transitions. If it becomes a problem, cursor-based pagination would fix it, but that is over-engineering for this use case.
**Warning signs:** Rapidly changing data causing items to jump between pages on each poll cycle.

## Code Examples

### Backend: Shared Query Parameter Parser

```typescript
// src/routes/admin/query-params.ts
export interface ParsedQueryParams {
  page: number;
  limit: number;
  sort_by: string;
  sort_order: 'asc' | 'desc';
  search: string;
}

const VALID_LIMITS = [20, 50, 100];

export function parseQueryParams(
  query: Record<string, string | undefined>,
  defaults: { sort_by: string; sort_order: 'asc' | 'desc' }
): ParsedQueryParams {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const rawLimit = parseInt(query.limit ?? '20', 10);
  const limit = VALID_LIMITS.includes(rawLimit) ? rawLimit : 20;
  const sort_order = query.sort_order === 'asc' ? 'asc' : 'desc';
  const sort_by = query.sort_by || defaults.sort_by;
  const search = (query.search ?? '').trim();

  return { page, limit, sort_by, sort_order, search };
}
```

### Backend: Paginated Kysely Query

```typescript
// src/repositories/pagination.ts
import type { SelectQueryBuilder } from 'kysely';

export interface PaginatedResult<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export async function paginateQuery<DB, TB extends keyof DB, O>(
  baseQuery: SelectQueryBuilder<DB, TB, O>,
  page: number,
  limit: number
): Promise<PaginatedResult<O>> {
  const offset = (page - 1) * limit;

  // Count query: clear selections, select only count
  const countResult = await baseQuery
    .clearSelect()
    .select((eb) => eb.fn.countAll().as('total'))
    .executeTakeFirstOrThrow();

  const total = Number((countResult as any).total);
  const total_pages = Math.ceil(total / limit);

  const data = await baseQuery
    .limit(limit)
    .offset(offset)
    .execute();

  return {
    data: data as O[],
    pagination: { page, limit, total, total_pages },
  };
}
```

**Note on Kysely `clearSelect()`:** The `clearSelect()` method was added in Kysely. If not available in the project's version, the alternative is to build two separate query branches from a common base (with shared WHERE clauses) -- one for count and one for data. Verify the Kysely version supports this.

### Frontend: useTableParams Hook

```typescript
// dashboard/src/hooks/useTableParams.ts
import { useSearchParams } from 'react-router';
import { useCallback } from 'react';

interface Defaults {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export function useTableParams(defaults: Defaults) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const limit = Number(searchParams.get('limit')) || 20;
  const sortBy = searchParams.get('sort_by') || defaults.sortBy;
  const sortOrder = (searchParams.get('sort_order') || defaults.sortOrder) as 'asc' | 'desc';
  const search = searchParams.get('search') || '';

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      // Reset page to 1 unless page itself is being updated
      if (!('page' in updates)) next.set('page', '1');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return { page, limit, sortBy, sortOrder, search, updateParams, searchParams };
}
```

### Frontend: Reusable DataTable with Sort Headers

```typescript
// dashboard/src/components/DataTable.tsx
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (item: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  rowKey: (item: T) => string;
}

function SortIcon({ column, sortBy, sortOrder }: { column: string; sortBy: string; sortOrder: string }) {
  if (column !== sortBy) return <ChevronsUpDown size={14} />;
  return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
}
```

### Frontend: Pagination Component

```typescript
// dashboard/src/components/Pagination.tsx
interface Props {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

// Shows: "Showing 1-20 of 47 results" + page buttons + page size dropdown
// Page buttons: [< Prev] [1] [2] [3] ... [7] [Next >]
// For many pages, show: [1] ... [4] [5] [6] ... [10]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `keepPreviousData` option in TanStack Query | `placeholderData: keepPreviousData` import | TanStack Query v5 (2023) | Must import `keepPreviousData` from `@tanstack/react-query` |
| `react-router-dom` separate package | `react-router` single package (v7) | react-router v7 (2025) | Already using correct import path |
| Client-side table sorting libraries | Server-side sorting with Kysely `orderBy` | N/A | Simple `orderBy` with whitelist is sufficient |

## Database Index Considerations

Current indexes on relevant tables:
- `apps`: `idx_apps_app_id` (app_id)
- `repositories`: `idx_repositories_repository_id`, `idx_repositories_github_url`, `idx_repositories_circuit`
- `app_repositories`: `idx_app_repositories_app_id`, `idx_app_repositories_repository_id`

**Missing indexes that would help pagination/filtering:**
- `app_repositories.status` -- used for filter by status. With low cardinality (4 values), a B-tree index is marginally useful but worthwhile for filtered count queries.
- `app_repositories.last_scanned_at` -- used for default sort order.
- `apps.app_name` -- used for search ILIKE (but ILIKE with leading wildcard cannot use B-tree index, so skip unless using pg_trgm).
- `repositories.created_at` -- used for default sort order on repositories page.

**Recommendation:** Add a Liquibase migration (007) for `app_repositories.status` and `app_repositories.last_scanned_at` indexes. These are the most impactful for the common query pattern (filter by status, sort by last_scanned_at). The other indexes are not needed given the expected data volume.

## API Response Shape Change

Current API returns:
```json
{ "data": [...] }
```

New paginated API returns:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "total_pages": 3
  }
}
```

This is a **breaking change** to the API response shape. However, since only the admin dashboard consumes these endpoints, and both frontend and backend are in the same monorepo, this can be coordinated in a single deployment. The shared types in `@docora/shared-types` must be updated to reflect the new `PaginatedResponse<T>` wrapper.

## Open Questions

1. **Kysely `clearSelect()` availability**
   - What we know: Kysely supports `clearSelect()` on `SelectQueryBuilder` to replace selections
   - What's unclear: Whether the project's exact Kysely version supports this method
   - Recommendation: Check the installed version. If unavailable, build two queries from a shared WHERE clause builder function instead. Both approaches work fine.

2. **Queue page server-side pagination scope**
   - What we know: BullMQ `getWaiting(start, end)` supports range fetching, but not arbitrary sorting
   - What's unclear: Whether to paginate queue jobs server-side or keep the current approach of fetching up to 50 jobs
   - Recommendation: Keep the current 50-job limit with client-side filtering/sorting for the Queue page. Queue jobs are ephemeral. If needed, increase the limit to 100 and add client-side pagination.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All existing pages, API routes, database schemas, shared types, CSS modules, hooks
- react-router 7.13.0 installed -- `useSearchParams` hook available and documented
- TanStack Query 5.90.20 installed -- `keepPreviousData` as `placeholderData` option available and documented

### Secondary (MEDIUM confidence)
- [React Router useSearchParams docs](https://reactrouter.com/api/hooks/useSearchParams) - API reference
- [TanStack Query Paginated Queries docs](https://tanstack.com/query/latest/docs/framework/react/examples/pagination) - Pagination pattern
- [Fastify TypeScript docs](https://fastify.dev/docs/latest/Reference/TypeScript/) - Route generic typing
- [Kysely pagination pattern](https://wanago.io/2023/09/18/api-nestjs-kysely-pagination-offset-keyset/) - Offset pagination with Kysely

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, versions verified in lockfile
- Architecture: HIGH -- patterns derived from existing codebase conventions and official documentation
- Pitfalls: HIGH -- identified from direct codebase analysis (BullMQ limitation, missing indexes, sort_by injection)
- API design: HIGH -- follows existing ApiResponse pattern, extends it with pagination metadata

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable -- no fast-moving dependencies)
