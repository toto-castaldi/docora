# Phase 6: Dashboard Cleanup - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the redundant global repositories page from the admin dashboard. Repository information is already shown per-app on the app detail page (AppDetailRepoTable). This phase removes the global page, its navigation link, and its backend endpoint. No new features.

</domain>

<decisions>
## Implementation Decisions

### Old URL behavior
- Old /repositories URL should return a 404 — clean break, no redirect
- Use the router's default 404 handling — no custom styled 404 page needed
- Backend API endpoint (GET /api/admin/repositories) removed entirely — Fastify's default 404 handler returns the standard JSON error
- No external references to worry about — page is internal-only for admins

### Cleanup depth
- Thorough cleanup: remove route file, handler, any repository-listing functions only used by this endpoint, unused imports, and types — leave no dead code
- Frontend: delete Repositories.tsx entirely along with any imports referencing it
- Sidebar/navigation: only remove the "Repositories" nav item — no other layout changes

### Claude's Discretion
- Whether to verify AppDetailRepoTable still renders correctly as a regression check (assess if any shared code could be affected by the removals)
- Exact order of file removals and any intermediate cleanup steps

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward removal task. Key files already identified:
- Frontend page: `dashboard/src/pages/Repositories.tsx`
- Backend endpoint: `src/routes/admin/dashboard-api-repos.ts`
- App detail repo table (must not regress): `AppDetailRepoTable.tsx`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dashboard-cleanup*
*Context gathered: 2026-02-14*
