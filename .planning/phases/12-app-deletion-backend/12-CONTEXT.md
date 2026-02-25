# Phase 12: App Deletion Backend - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin API endpoint to delete an app with full cascade cleanup. Removes app record, repository links, snapshots, and deliveries. Preserves shared resources (repo clones, repository records) when other apps still use them. Handles in-flight BullMQ jobs gracefully. UI for triggering deletion is Phase 13.

</domain>

<decisions>
## Implementation Decisions

### API response design
- Claude's discretion on: response format (204 vs 200 with summary), endpoint path convention, confirmation mechanism, and not-found behavior
- Must follow existing admin route patterns in the codebase

### Partial failure strategy
- Best-effort disk cleanup: if DB deletion succeeds but git clone removal fails, log the error and move on
- Orphaned disk files are logged and forgotten — no retry tracking, admin can clean up manually
- All DB deletes (app, repository links, snapshots, deliveries) must happen in a single transaction — all-or-nothing for data integrity
- Shared repo check: simple count of active apps watching the repo. If no other app watches it, remove the clone and repository record. No locking for concurrent deletions.

### In-flight job behavior
- Running snapshot workers check if the app still exists in DB before committing results (saving snapshot, sending notifications)
- When a worker detects the app is gone: log at info level ("App deleted, aborting job"), mark job as completed (not failed) so it doesn't retry
- Deletion endpoint proactively removes pending (not yet started) BullMQ jobs for the deleted app
- Deletion proceeds immediately — does not wait for in-flight jobs to finish. Running jobs self-detect on their next DB check.

### Claude's Discretion
- HTTP method, path, and response shape (follow existing route conventions)
- Confirmation mechanism (e.g., require app name in body or not)
- Not-found behavior (404 vs idempotent 204)
- Exact placement of DB existence checks in the worker flow
- Error response format and status codes

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing codebase conventions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-app-deletion-backend*
*Context gathered: 2026-02-25*
