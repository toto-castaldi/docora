# Phase 3 Research: Retry Operations & Actions

**Researched:** 2026-02-07
**Overall confidence:** HIGH
**Mode:** Ecosystem (focused on implementation patterns within existing stack)

---

## Executive Summary

Phase 3 adds three action capabilities to the admin dashboard: single retry, bulk retry (per-app and global), and force re-sync. The existing codebase is well-positioned for all three features. The snapshot worker already handles retry logic via status changes (`failed` -> `pending_snapshot`), and the scheduler already picks up `pending_snapshot` entries. The primary work is: (1) new backend POST endpoints that flip statuses and queue jobs, (2) frontend mutation hooks with `useMutation`, and (3) a bulk retry progress tracking system using polling.

The biggest design challenge is **bulk retry with live progress and cancellation**. Since the project uses polling (not WebSocket), progress tracking requires a server-side tracking mechanism -- either a dedicated DB row or a Redis key -- that the frontend polls. Cancellation requires a flag the worker checks before processing each job in a batch.

No new libraries are needed. All features can be built with BullMQ, Kysely, TanStack Query `useMutation`, and `react-hot-toast` -- all already in the project.

---

## Stack Analysis

### No New Dependencies Required

Every feature in this phase can be built with existing dependencies:

| Need | Existing Tool | How |
|------|---------------|-----|
| Queue jobs | BullMQ `Queue.add()` | Already used in scheduler |
| Bulk queue | BullMQ `Queue.addBulk()` | Available in bullmq@5.66.4 |
| DB mutations | Kysely `updateTable` | Already used throughout |
| Frontend mutations | TanStack Query `useMutation` | Already installed (@tanstack/react-query@5.90.20) |
| Toast feedback | react-hot-toast | Already installed and configured |
| Icons | lucide-react | Already installed |
| Confirmation dialog | Native HTML `<dialog>` or custom component | No library needed |

**Confidence: HIGH** -- All tools verified present in `package.json`.

---

## Feature Breakdown

### Feature 1: Single Retry

**What it does:** Admin clicks "Retry" on a failed notification card. The system queues a BullMQ snapshot job for that specific app+repository pair.

**Backend implementation:**
- New endpoint: `POST /admin/api/retry` with body `{ app_id, repository_id }`
- Action: Set `app_repositories.status = 'pending_snapshot'`, reset `retry_count = 0`, clear `last_error`
- The existing scheduler (`scanAndQueuePending`) will pick it up on next interval (60s default)
- **Alternative (recommended):** Immediately queue the BullMQ job directly, bypassing scheduler wait time. Use the same `Queue.add()` pattern from `snapshot.scheduler.ts` with the same job data structure (`SnapshotJobData`).

**Why queue immediately instead of just flipping status:** The scheduler runs every 60s. The admin expects near-instant feedback that something is happening. Directly adding a BullMQ job means processing starts within seconds, not up to 60s later.

**Frontend implementation:**
- `useMutation` calling `POST /admin/api/retry`
- On success: `queryClient.invalidateQueries(["notifications", "failed"])` to refresh the list
- Toast: `toast.success("Retry queued for {repo_name}")`

**UI recommendation:** The retry button should appear on **both** the Notifications page (each card) and the AppDetail page (next to each failed repository row). The button shows a loading spinner while the mutation is in flight, then the row updates on next poll cycle.

**After queueing feedback (discretion decision):** Change the status badge from "Failed" to "Pending" inline. Do NOT remove the row immediately -- the admin should see the transition. The next poll cycle (10s) will naturally refresh the data and either show the row gone (if it succeeds quickly) or still pending.

**Complexity:** Low. ~2 backend files, ~2 frontend modifications.

### Feature 2: Bulk Retry

**What it does:** Admin clicks "Retry All" (globally on Notifications page, or per-app on AppDetail page). The system queues BullMQ jobs for all failed notifications in scope. Shows live progress counter.

**Backend implementation:**

Two endpoints:
- `POST /admin/api/retry/app/:appId` -- retry all failed for one app
- `POST /admin/api/retry/all` -- retry all failed globally

Both endpoints:
1. Query all `app_repositories` with `status = 'failed'` (filtered by app_id if per-app)
2. Create a "bulk operation" tracking record (see progress tracking below)
3. For each failed entry: reset status to `pending_snapshot`, reset `retry_count`, queue a BullMQ job immediately
4. Return `{ operation_id, total_count }` so the frontend can poll for progress

**Progress tracking approach (recommended: Redis-based):**

Use a Redis hash to track bulk operation progress:
```
Key: bulk-retry:{operation_id}
Fields: { total: 23, completed: 0, succeeded: 0, failed: 0, cancelled: false }
```

- The snapshot worker, upon completing or failing a job that belongs to a bulk operation, increments the completed counter via Redis `HINCRBY`
- Frontend polls `GET /admin/api/retry/progress/:operationId` every 2 seconds
- When `completed >= total` or `cancelled === true`, progress polling stops

**Why Redis over DB:** Bulk retry progress is ephemeral data that changes rapidly (every job completion). Redis HINCRBY is atomic and fast. No migration needed. The data is naturally transient -- no need to persist operation history.

**Cancellation approach:**

Set `cancelled = true` on the Redis hash. Before the snapshot worker begins processing each job, check the cancellation flag:
- If the job data includes a `bulk_operation_id`, check `HGET bulk-retry:{id} cancelled`
- If cancelled, skip the job (mark as completed without processing, do NOT reset the app_repository status back to failed -- leave it pending so admin can decide)
- Already-running jobs complete normally (cannot interrupt a mid-flight HTTP notification)

**Important design consideration:** Cancellation stops _unstarted_ retries in the batch. The BullMQ worker processes jobs one-at-a-time per concurrency slot. A cancelled flag only prevents the _next_ dequeued job from executing.

**Frontend implementation:**
- "Retry All" button triggers mutation
- Mutation returns `operation_id`
- Switch to a progress view: `"15/23 completed"` with a progress bar
- Poll `GET /admin/api/retry/progress/:operationId` at 2s interval
- "Cancel" button calls `POST /admin/api/retry/cancel/:operationId`
- When complete, show summary toast: `"Bulk retry complete: 20 succeeded, 3 failed"`

**Confirmation dialog (discretion decision):** YES, require confirmation for bulk retry. The dialog should say "Retry X failed notifications?" with "Retry All" and "Cancel" buttons. Rationale: bulk retry triggers potentially hundreds of webhook calls to client applications; an accidental click should not cause this.

**Complexity:** High. This is the most complex feature in this phase.

### Feature 3: Force Re-sync

**What it does:** Admin triggers a full re-sync of a repository for an app. The system treats it as if the repository has never been scanned, re-sending all files.

**Backend implementation:**

Two endpoints:
- `POST /admin/api/resync` with body `{ app_id, repository_id }` -- single repo for one app
- `POST /admin/api/resync/app/:appId` -- re-sync all repos for an app

**Re-sync implementation approach (discretion decision: clear deliveries, not delete snapshot):**

The recommended approach is to **clear the app's delivery records** (`app_delivered_files`) for the target repository, then set status to `pending_snapshot`:

1. Call `clearDeliveries(app_id, repository_id)` -- already exists in `src/repositories/deliveries.ts`
2. Set `app_repositories.status = 'pending_snapshot'`, reset `retry_count = 0`
3. Queue a BullMQ snapshot job immediately

**Why clear deliveries (not delete snapshot or re-clone):**
- The repository snapshot (`repository_snapshots` table) records the latest known state of the repo on disk. Deleting it would force _all_ apps to re-sync, not just the target app.
- Delivery tracking is per-app (`app_delivered_files`). Clearing it for one app makes the change detector think all current files are "created" (since `getDeliveredFiles()` returns an empty map), triggering create notifications for every file.
- The local git clone is still valid. No need to re-clone -- the next `cloneOrPull()` does a `fetch + reset` anyway.
- This approach is surgically precise: only the target app gets re-notified. Other apps are unaffected.

**Per-app re-sync** (`POST /admin/api/resync/app/:appId`): Loop through all repositories for the app, clear deliveries for each, and queue jobs. Can reuse the same bulk operation progress tracking from Feature 2.

**Confirmation dialog (discretion decision):** YES, require confirmation for both single and per-app re-sync. Single: "Re-sync {repo_name} for {app_name}? This will re-send all files." Per-app: "Re-sync all repositories for {app_name}? This will re-send all files for {repo_count} repositories." Rationale: re-sync triggers notifications for _every_ file, which could be hundreds. The client app will receive a flood of create webhooks. This is intentional but should not happen accidentally.

**Frontend placement:**
- Single re-sync: Button on each repository row in the AppDetail page, and each repository row in the Repositories page
- Per-app re-sync: Button in the AppDetail page header area

**Complexity:** Medium. Leverages existing `clearDeliveries()` and snapshot worker.

---

## Architecture Patterns

### Backend Route Organization

New admin action routes should be in a separate file from the read-only dashboard API:

```
src/routes/admin/
  dashboard-api.ts      (existing: GET endpoints for reading data)
  dashboard-actions.ts  (new: POST endpoints for mutations)
```

This follows separation of concerns -- reads vs writes in separate modules. Both files register under the same `/admin/api/` prefix and share the session auth hook.

### Service Layer for Actions

Create a new service that orchestrates retry/re-sync logic:

```
src/services/admin-actions.ts
```

This service:
- Encapsulates the logic for single retry, bulk retry, and re-sync
- Depends on repositories (data access), queue (job creation), and Redis (progress tracking)
- Keeps route handlers thin (validate input -> call service -> return response)

### Shared Types Extension

Add new types to `packages/shared-types/src/dashboard.ts`:

```typescript
export interface RetryResponse {
  queued: boolean;
  app_id: string;
  repository_id: string;
}

export interface BulkRetryResponse {
  operation_id: string;
  total_count: number;
}

export interface BulkRetryProgress {
  operation_id: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
}

export interface ResyncResponse {
  queued: boolean;
  app_id: string;
  repository_id: string;
}
```

### Frontend Mutation Pattern

Establish a reusable pattern for all action mutations:

```typescript
// api/admin.ts - Add mutation functions alongside existing query functions
async function postApi<TReq, TRes>(endpoint: string, body: TReq): Promise<TRes> {
  const response = await fetch(`/admin${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) { /* error handling */ }
  const data = await response.json() as ApiResponse<TRes>;
  return data.data;
}
```

### Confirmation Dialog Component

Build a lightweight, reusable confirmation dialog:

```
dashboard/src/components/ConfirmDialog.tsx
dashboard/src/components/ConfirmDialog.module.css
```

Use the native HTML `<dialog>` element for accessibility (focus trapping, escape key). Props: `title`, `message`, `confirmLabel`, `confirmVariant` (danger/primary), `onConfirm`, `onCancel`, `isOpen`.

### Bulk Operation ID

Use a simple counter or UUID for bulk operation IDs. Recommendation: `crypto.randomUUID()` (available in Node 22+, which the project requires). Store in Redis with a TTL (e.g., 1 hour) so stale operations auto-cleanup.

---

## BullMQ Integration Details

### Job Data Extension

The existing `SnapshotJobData` interface may need a new optional field:

```typescript
export interface SnapshotJobData {
  // ... existing fields ...
  bulk_operation_id?: string;  // For tracking bulk retry progress
}
```

The snapshot worker checks this field. If present and the operation is cancelled, skip processing.

### Queue Access from API Server

Currently, only the worker process creates a BullMQ `Queue` for adding jobs (in `snapshot.scheduler.ts`). The API server needs queue access too. The `queue-status.ts` service already creates a read-only queue connection for `getQueueStatus()`.

**Recommendation:** Extract a shared `getSnapshotQueue()` function that both the scheduler and the admin actions service can use. Or, since `queue-status.ts` already has a queue instance, extend it with job-adding capabilities.

### Job ID Strategy for Admin-Triggered Jobs

The scheduler uses `${app_id}-${repository_id}` as job IDs and checks for existing jobs before adding. Admin-triggered retries should follow the same pattern to avoid duplicate jobs. Before adding, check if a job with that ID is already waiting/active/delayed.

### Worker Modification for Bulk Tracking

The snapshot worker needs a small modification: after completing or failing a job, if `bulk_operation_id` is present, increment the Redis progress counter. This is a ~5-line addition to the existing `processSnapshotJob` function.

---

## UI/UX Recommendations (Discretion Decisions)

### Action Feedback Pattern

Use a **three-layer feedback approach**:

1. **Immediate:** Button enters loading state (spinner icon, disabled)
2. **Toast:** On mutation success/error, show a toast via react-hot-toast
3. **Data refresh:** `invalidateQueries` triggers re-fetch, UI updates naturally

This aligns with existing patterns (the dashboard already uses react-hot-toast in `usePolling.ts` error handling).

### Button Placement Summary

| Action | Notifications Page | AppDetail Page | Repositories Page |
|--------|-------------------|----------------|-------------------|
| Single retry | Each card | Each failed repo row | No |
| Bulk retry (app) | No | Header action button | No |
| Bulk retry (global) | Header action button | No | No |
| Single re-sync | No | Each repo row | Each repo row |
| Per-app re-sync | No | Header action button | No |

### Progress Indicator for Bulk Operations

When a bulk retry is active, replace the action button area with a progress section:

```
[==========>          ] 15/23 completed
[Cancel Remaining]
```

Use a `useQuery` with `refetchInterval: 2000` that polls the progress endpoint. When `completed >= total`, stop polling and show a summary.

### Toast Messages

| Action | Success Toast | Error Toast |
|--------|--------------|-------------|
| Single retry | "Retry queued for owner/repo" | "Failed to queue retry" |
| Bulk retry | "Bulk retry complete: X succeeded, Y failed" | "Failed to start bulk retry" |
| Single re-sync | "Re-sync queued for owner/repo" | "Failed to queue re-sync" |
| Per-app re-sync | "Re-sync queued for X repositories" | "Failed to queue re-sync" |

---

## Pitfalls

### Critical Pitfalls

#### 1. Duplicate Job Submission
**What goes wrong:** Admin clicks "Retry" while a job for the same app+repo is already waiting or active in the queue. Two jobs for the same pair run concurrently, causing duplicate notifications.
**Prevention:** Before adding a job, check for existing jobs using the same job ID pattern (`${app_id}-${repository_id}`). If a job exists in waiting/active/delayed state, return a 409 Conflict response: "A retry is already in progress."
**Detection:** Duplicate notifications appearing in client app logs.

#### 2. Bulk Retry Race Condition with Scheduler
**What goes wrong:** The scheduler runs while a bulk retry is adding jobs. Both try to queue jobs for the same app+repo pairs.
**Prevention:** The scheduler already checks for existing jobs before adding (`getJob` + `getState` check in `scanAndQueuePending`). As long as admin-triggered retries use the same job ID pattern, the scheduler will skip entries that are already queued.
**Detection:** "Job is waiting/active, skipping" messages in scheduler logs for entries that were just admin-retried.

#### 3. Re-sync Without Understanding Impact
**What goes wrong:** Admin force re-syncs a repository with 500+ files. The client app receives 500+ create webhook calls in rapid succession and falls over.
**Prevention:** Confirmation dialog that states the file count: "This will re-send approximately N files." Consider fetching the snapshot file count before confirming.
**Detection:** Client app returning 5xx errors during re-sync.

### Moderate Pitfalls

#### 4. Cancelled Bulk Retry Leaves Entries in Pending State
**What goes wrong:** Admin cancels a bulk retry. Some jobs were already reset to `pending_snapshot` but will never be processed (they were supposed to be the cancelled portion). The scheduler picks them up on the next interval anyway.
**Prevention:** This is actually acceptable behavior. Once status is `pending_snapshot`, the scheduler naturally picks it up. The "cancellation" only prevents the _queued BullMQ jobs_ from processing. But the status was already flipped. Two options: (a) Accept it -- the scheduler retries them later anyway. (b) On cancellation, also reset the unprocessed entries back to `failed`.
**Recommendation:** Option (a) is simpler and has no downside. The admin wanted to retry; cancelling just stops the immediate batch but the system recovers naturally.

#### 5. Bulk Operation Redis Key Leak
**What goes wrong:** Operation tracking Redis keys accumulate if never cleaned up.
**Prevention:** Set a TTL on all `bulk-retry:{id}` keys (e.g., 1 hour). After bulk completion, the frontend stops polling. The key expires automatically.

#### 6. Frontend Stale Data After Mutation
**What goes wrong:** After retrying, the Notifications page still shows the old "failed" entry until the next poll cycle.
**Prevention:** Use `queryClient.invalidateQueries()` in the mutation's `onSuccess`. This triggers an immediate re-fetch rather than waiting for the 10s poll interval.

### Minor Pitfalls

#### 7. Loading State Flicker
**What goes wrong:** Retry button shows loading spinner for only 50ms (fast network), causing a visual flicker.
**Prevention:** Add a minimum display time for loading state (200ms). Or use optimistic updates to change the badge immediately.

#### 8. ConfirmDialog Accessibility
**What goes wrong:** Confirmation dialog doesn't trap focus, doesn't support Escape key, screen readers can't interact.
**Prevention:** Use native `<dialog>` element which handles focus trapping and Escape key natively. Add `aria-label` and proper heading structure.

---

## Implications for Roadmap

Based on research, the phase should be structured in this order:

### Suggested Plan Sequence

1. **Backend action service + single retry endpoint** -- Foundation for all actions. Establishes the `postApi` pattern, admin-actions route file, and single retry logic.
   - Addresses: Single retry (most common use case)
   - Validates: Queue integration from API server works

2. **Frontend single retry button + mutation hook** -- Establishes the frontend mutation pattern (`useMutation`, `invalidateQueries`, toast).
   - Addresses: Admin can retry a single failed notification
   - Establishes: Reusable patterns for all subsequent actions

3. **Confirmation dialog component** -- Reusable component needed by bulk retry and re-sync.
   - Addresses: Safe bulk operations
   - Small, focused deliverable

4. **Bulk retry backend (with progress tracking)** -- Most complex backend piece. Redis-based progress tracking, cancellation flag.
   - Addresses: Per-app and global bulk retry
   - Avoids: Duplicate job pitfall (builds on single retry patterns)

5. **Bulk retry frontend (with progress UI)** -- Progress counter, cancel button, polling.
   - Addresses: Live progress tracking, cancellation
   - Depends on: Backend progress endpoints from plan 4

6. **Force re-sync backend + frontend** -- Leverages all patterns established above.
   - Addresses: Repository re-sync
   - Reuses: Confirmation dialog, mutation hooks, toast patterns

7. **Phase verification (UAT)** -- Verify all success criteria.

### Phase Ordering Rationale

- Single retry first because it establishes all foundational patterns (backend action routes, frontend mutations, queue integration) with the simplest feature
- Bulk retry second because it adds complexity on top of established patterns
- Re-sync last because it reuses everything from retry and adds minimal new concepts
- Confirmation dialog before bulk retry because bulk retry needs it

### Research Flags for Plans

- Plan 4 (Bulk retry backend): **Likely needs careful implementation** -- Redis progress tracking and cancellation flag are the most novel patterns in this phase
- Plans 1-3, 5-6: Standard patterns based on existing codebase conventions, unlikely to need additional research

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Single retry | HIGH | Direct extension of existing scheduler pattern |
| Bulk retry mechanics | HIGH | BullMQ addBulk() + Redis hash tracking well documented |
| Bulk cancellation | MEDIUM | Cancellation requires worker modification; need to handle edge cases carefully |
| Re-sync approach | HIGH | `clearDeliveries()` already exists and is tested |
| Frontend mutations | HIGH | TanStack Query useMutation is standard, react-hot-toast already configured |
| Progress polling | HIGH | Uses same `refetchInterval` pattern already in usePolling.ts |
| Confirmation dialog | HIGH | Native `<dialog>` element, no dependencies |

---

## Open Questions

1. **Bulk retry concurrency:** Should bulk retry jobs get higher/lower priority than regular scheduler jobs? Current recommendation: same priority (FIFO). If the admin needs urgency, they already get immediate queueing rather than waiting for scheduler.

2. **Re-sync file count display:** Should the confirmation dialog show the approximate file count? This requires an additional query to `snapshot_files` before confirming. Nice-to-have but not critical for v1.

3. **Operation history:** Should completed bulk operations be logged anywhere? Current recommendation: no, they are ephemeral (Redis TTL). If needed later, can add in a future phase.

---

## Sources

- [BullMQ Queues Documentation](https://docs.bullmq.io/guide/queues)
- [BullMQ Events Documentation](https://docs.bullmq.io/guide/events)
- [BullMQ Job Removal](https://docs.bullmq.io/guide/jobs/removing-job)
- [BullMQ Bulk Job Addition](https://docs.bullmq.io/patterns/adding-bulks)
- [BullMQ Job Cancellation](https://docs.bullmq.io/guide/workers/cancelling-jobs)
- [TanStack Query useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation)
- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [TanStack Query Invalidations from Mutations](https://tanstack.com/query/v4/docs/react/guides/invalidations-from-mutations)
- Existing codebase: `src/workers/snapshot.worker.ts`, `src/workers/snapshot.scheduler.ts`, `src/repositories/deliveries.ts`, `src/services/queue-status.ts`
