# Phase 3: Retry Operations & Actions - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can recover from notification failures through retry operations. Includes single notification retry, bulk retry (per-app and global), and force re-sync of repositories. Search, filtering, and enhanced visibility belong in Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Retry behavior
- Single retry queues a BullMQ background job (not synchronous inline call)
- No limit on retries — admin can retry as many times as they want
- Claude's Discretion: UI feedback pattern after queueing (status badge change vs row removal)
- Claude's Discretion: Retry button placement (Notifications page, AppDetail page, or both)

### Bulk retry scope
- Two levels: per-app retry AND global "retry all" across all apps
- Live progress tracking: show counter like "15/23 completed" updating in real-time
- Cancelable: stop button to cancel remaining retries (already-sent ones stay sent)
- Claude's Discretion: Whether bulk retry requires confirmation dialog

### Force re-sync mechanics
- Available on any repository, not just failed ones — useful for edge cases
- Appears at both per-repository level AND per-app level (re-sync all repos for an app)
- Claude's Discretion: Exact re-sync behavior (delete snapshot vs fresh clone)
- Claude's Discretion: Whether re-sync requires confirmation (given it can trigger many client notifications)

### Claude's Discretion
- UI feedback pattern after single retry (status badge change vs row disappears)
- Retry button placement across pages
- Confirmation dialogs for bulk retry and force re-sync
- Re-sync implementation approach (delete snapshot or fresh clone)
- Action feedback UI (toast notifications, inline state changes)

</decisions>

<specifics>
## Specific Ideas

- Bulk retry should feel responsive — live progress counter, not just "queued" and wait
- Cancel button for bulk retry should stop remaining work without affecting already-sent retries
- Force re-sync available even on healthy repos for edge case recovery

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-retry-operations-actions*
*Context gathered: 2026-02-07*
