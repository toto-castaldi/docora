# Phase 2: Dashboard Integration & Core Display - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can view comprehensive system state through a monitoring dashboard: registered apps, repositories per app, failed notifications with error details, job queue status, and history of sent updates. This phase is read-only — retry operations and filtering belong in later phases.

</domain>

<decisions>
## Implementation Decisions

### Navigation & structure
- Sidebar navigation with left menu and main content area
- Menu items: Overview, Apps, Repositories, Notifications, Queue (5 items)
- Overview page shows key metrics (counts) plus alerts list (things needing attention)
- Clicking an app navigates to detail page (/admin/apps/:id) showing that app's repos and notifications

### Data display style
- Card-based layout for all lists (apps, repos, notifications)
- Failed notifications show: error message, timestamp, app, repo, retry count (all visible on card)
- Status indicators use color + icon together (red/X for failed, green/check for success, yellow/spinner for pending)
- Job queue shows counts plus a list of currently running/pending jobs with details

### Refresh & polling
- Auto-polling every 10 seconds by default
- Manual refresh button also available
- "Updated X seconds ago" indicator visible
- Polling continues even when browser tab is hidden

### Empty & error states
- Empty states show minimal message ("No apps yet", "No repositories", etc.)
- API errors show toast notification, keep stale data visible
- Error toasts auto-dismiss after 5 seconds

### Claude's Discretion
- Tone for "no failed notifications" state (positive vs neutral)
- Exact card layouts and spacing
- Loading skeleton design
- Sidebar collapse behavior on mobile

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for admin dashboard patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-dashboard-core-display*
*Context gathered: 2026-01-29*
