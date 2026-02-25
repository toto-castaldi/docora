# Phase 12: App Deletion Backend - Research

**Researched:** 2026-02-25
**Domain:** Backend API + data cascade cleanup + BullMQ job lifecycle
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Claude's discretion on: response format (204 vs 200 with summary), endpoint path convention, confirmation mechanism, and not-found behavior
- Must follow existing admin route patterns in the codebase
- Best-effort disk cleanup: if DB deletion succeeds but git clone removal fails, log the error and move on
- Orphaned disk files are logged and forgotten -- no retry tracking, admin can clean up manually
- All DB deletes (app, repository links, snapshots, deliveries) must happen in a single transaction -- all-or-nothing for data integrity
- Shared repo check: simple count of active apps watching the repo. If no other app watches it, remove the clone and repository record. No locking for concurrent deletions.
- Running snapshot workers check if the app still exists in DB before committing results (saving snapshot, sending notifications)
- When a worker detects the app is gone: log at info level ("App deleted, aborting job"), mark job as completed (not failed) so it doesn't retry
- Deletion endpoint proactively removes pending (not yet started) BullMQ jobs for the deleted app
- Deletion proceeds immediately -- does not wait for in-flight jobs to finish. Running jobs self-detect on their next DB check.

### Claude's Discretion
- HTTP method, path, and response shape (follow existing route conventions)
- Confirmation mechanism (e.g., require app name in body or not)
- Not-found behavior (404 vs idempotent 204)
- Exact placement of DB existence checks in the worker flow
- Error response format and status codes

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEL-01 | Admin can delete an app with full cascade cleanup (app record, repository links, snapshots, deliveries) while preserving repo clones used by other apps | Kysely transaction pattern, FK constraint analysis, orphan-check pattern from `repository-management.ts`, admin session auth pattern from `dashboard-actions.ts` |
| DEL-02 | In-flight BullMQ jobs for a deleted app exit cleanly without FK violations or retry loops | BullMQ `queue.remove(jobId)` for pending jobs, worker app-existence guard before DB writes, complete (not fail) pattern |
</phase_requirements>

## Summary

This phase adds a single admin API endpoint (`DELETE /admin/api/apps/:appId`) that performs full cascade cleanup when deleting an app. The codebase already has all the building blocks: `unwatchRepository` in `repository-management.ts` handles per-repo unlink/orphan/cleanup, `admin-actions.ts` demonstrates BullMQ queue access patterns for job removal, and `dashboard-actions.ts` shows the session-auth hook pattern for admin routes.

The main new work is: (1) a service that wraps the cascade logic in a Kysely transaction for the DB deletes, then does best-effort disk cleanup outside the transaction, (2) proactive removal of pending BullMQ jobs, and (3) adding an app-existence guard inside the snapshot worker so in-flight jobs exit cleanly when their app is deleted mid-processing.

**Primary recommendation:** Build a `deleteApp` service function that gathers all repos for the app, deletes all DB records in one transaction (deliveries, app_repositories, then apps), then does post-transaction cleanup (orphan repos, disk clones, BullMQ pending jobs). Add a lightweight existence check in the worker before saving results.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | ^0.28.9 | Transaction for atomic DB deletes | Already used everywhere in the codebase |
| BullMQ | ^5.66.4 | Remove pending jobs for deleted app | Already used for snapshot queue |
| Fastify | ^5.6.2 | DELETE route with admin session auth | Already used for all routes |
| Vitest | ^4.0.16 | Unit tests for delete service + route | Already used for all tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | ^5.9.1 | Redis connection for BullMQ Queue instance | Queue access in deletion service |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual FK-aware delete order | DB-level ON DELETE CASCADE on all FKs | Would require a migration to add CASCADE to `app_repositories` FK; manual order is simpler for a one-time operation and the codebase already uses manual deletes |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── routes/admin/
│   └── delete-app.ts           # DELETE /admin/api/apps/:appId route
├── services/
│   └── app-deletion.ts         # deleteApp() orchestrator service
├── repositories/
│   └── apps.ts                 # Add findAppById(), deleteAppCascade()
├── workers/
│   └── snapshot.worker.ts      # Add app-existence guard (modify existing)
```

### Pattern 1: Transaction-Based Cascade Delete
**What:** All DB deletes for app removal happen inside a single Kysely transaction. Tables are deleted in FK-safe order: `app_delivered_files` -> `app_repositories` -> `apps`. Repository-level cleanup (snapshots, repository records) happens only for orphaned repos.
**When to use:** Always for this deletion endpoint.
**Example:**
```typescript
// Source: Kysely Context7 docs + codebase pattern
await db.transaction().execute(async (trx) => {
  // 1. Delete deliveries for all app-repo pairs
  await trx.deleteFrom("app_delivered_files")
    .where("app_id", "=", appId)
    .execute();

  // 2. Delete app-repository links
  await trx.deleteFrom("app_repositories")
    .where("app_id", "=", appId)
    .execute();

  // 3. Delete the app record itself
  await trx.deleteFrom("apps")
    .where("app_id", "=", appId)
    .execute();
});
```

### Pattern 2: Post-Transaction Orphan Cleanup
**What:** After the transaction commits, check each formerly-linked repository for orphan status. If orphaned, delete from DB and remove local clone. Failures are logged, not retried.
**When to use:** After every app deletion, for each repository the app was watching.
**Example:**
```typescript
// Source: existing pattern in repository-management.ts
for (const repo of repos) {
  const orphan = await isRepositoryOrphan(repo.repository_id);
  if (orphan) {
    await deleteRepository(repo.repository_id);  // DB: snapshots + repository record
    try {
      await withRepoLock(`${repo.owner}/${repo.name}`, `delete-app-${appId}`, async () => {
        deleteLocalRepository(repo.owner, repo.name);
      });
    } catch (err) {
      console.error(`Failed to delete local clone for ${repo.owner}/${repo.name}:`, err);
      // Best-effort: log and continue
    }
  }
}
```

### Pattern 3: Proactive BullMQ Job Removal
**What:** After DB deletion, iterate the app's former repos and remove any pending/delayed BullMQ jobs. Active (in-flight) jobs are left alone -- the worker's existence check handles those.
**When to use:** During app deletion, after DB transaction.
**Example:**
```typescript
// Source: BullMQ Context7 docs + codebase pattern in admin-actions.ts
const queue = getQueue();
for (const repo of repos) {
  const jobId = `${appId}-${repo.repository_id}`;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === "waiting" || state === "delayed") {
        await job.remove();
        console.log(`Removed pending job ${jobId}`);
      }
    }
  } catch (err) {
    console.error(`Failed to remove job ${jobId}:`, err);
    // Best-effort: log and continue
  }
}
```

### Pattern 4: Worker App-Existence Guard
**What:** Before the snapshot worker commits its results (saving snapshot, recording deliveries, updating status), it checks if the app still exists. If not, it logs and completes the job without writing.
**When to use:** Added to `processSnapshotJob` in the snapshot worker, right before the "save results" phase.
**Example:**
```typescript
// Source: codebase pattern
const appExists = await db
  .selectFrom("apps")
  .select("app_id")
  .where("app_id", "=", app_id)
  .executeTakeFirst();

if (!appExists) {
  console.log(`${logPrefix} App deleted, aborting job`);
  return; // Completes successfully -- no retry
}
```

### Anti-Patterns to Avoid
- **Deleting the app record first:** Would cause FK violations on `app_repositories` (no ON DELETE CASCADE on that FK). Must delete children first.
- **Using DB-level CASCADE for app_repositories:** The `app_repositories` FK to `apps` does NOT have ON DELETE CASCADE. Adding it now would be a migration for something we can handle in application code. Not worth it.
- **Waiting for in-flight jobs:** The CONTEXT.md decision is clear: deletion proceeds immediately. Workers self-detect.
- **Failing the BullMQ job on app-not-found:** Would trigger retries. Decision says mark as completed, not failed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-table delete | Manual try/catch with partial rollback | Kysely `db.transaction().execute()` | Guaranteed atomicity, auto-rollback on error |
| Orphan repository detection | Custom counting logic | Existing `isRepositoryOrphan()` from `repositories.ts` | Already implemented and tested |
| Local clone deletion | Custom fs operations | Existing `deleteLocalRepository()` from `git.ts` + `withRepoLock()` | Already handles path construction, existence check, and locking |
| BullMQ job ID construction | Guessing job IDs | Use same pattern `${appId}-${repositoryId}` from scheduler | Consistent with existing codebase |

**Key insight:** Nearly all the building blocks exist. The new code is primarily orchestration -- wiring existing functions together in the right order with a transaction wrapper.

## Common Pitfalls

### Pitfall 1: FK Violation on App Delete
**What goes wrong:** Deleting from `apps` before deleting `app_repositories` rows causes a foreign key violation because `fk_app_repositories_app` references `apps(app_id)` without CASCADE.
**Why it happens:** The `app_repositories` FK was created without `onDelete: CASCADE` (unlike `app_delivered_files` which does have CASCADE).
**How to avoid:** Delete in order: `app_delivered_files` -> `app_repositories` -> `apps`, all within one transaction.
**Warning signs:** PostgreSQL error `violates foreign key constraint "fk_app_repositories_app"`.

### Pitfall 2: Orphan Check Race Condition
**What goes wrong:** Two apps sharing a repo are deleted simultaneously. Both check `isRepositoryOrphan` after their own deletion but before the other's deletion commits. Both see count=1 (the other app), neither cleans up.
**Why it happens:** No locking on the orphan check (per CONTEXT.md decision: "No locking for concurrent deletions").
**How to avoid:** Accept this as a known limitation per the user's decision. Orphaned disk files are "logged and forgotten" -- admin can clean up manually. This is extremely rare (admin manually deleting two apps at the same instant).
**Warning signs:** Disk space slowly growing from orphaned clones. Could be addressed by a periodic cleanup job in the future.

### Pitfall 3: Worker FK Violation on Delivery Record
**What goes wrong:** Worker tries to `recordDelivery` or `updateAppRepositoryStatus` after the app has been deleted. The FK on `app_delivered_files` cascaded away the rows, and the `app_repositories` rows were explicitly deleted.
**Why it happens:** Worker was mid-processing when the app was deleted.
**How to avoid:** Add app-existence check in the worker before the "save results" section. If the app is gone, log and return (completes the job).
**Warning signs:** Worker errors like `violates foreign key constraint` or `referenced row not found`.

### Pitfall 4: BullMQ Job Retry Loop
**What goes wrong:** Worker throws an error (because app is gone) instead of returning cleanly. BullMQ retries the job up to 5 times, each failing.
**Why it happens:** Not handling the "app deleted" case as a clean completion.
**How to avoid:** Return from processSnapshotJob (don't throw) when app is detected as deleted. The job completes successfully from BullMQ's perspective.
**Warning signs:** Repeated job failures in the queue dashboard for a deleted app.

### Pitfall 5: Repository Snapshots Left Behind
**What goes wrong:** When a repository becomes orphaned after app deletion, the `repository_snapshots` and `snapshot_files` are not cleaned up.
**Why it happens:** Forgetting to delete snapshots before deleting the repository record.
**How to avoid:** The existing `deleteRepository()` in `repositories.ts` already handles this -- it deletes `repository_snapshots` first (which cascades to `snapshot_files` via `deleteCascade: true`), then deletes the `repositories` row. Use the existing function.
**Warning signs:** Orphaned rows in `repository_snapshots` table.

## Code Examples

### Delete Route (admin session auth pattern)
```typescript
// Source: existing pattern from dashboard-actions.ts and onboard.ts
export async function deleteAppRoute(server: FastifyInstance): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  server.delete<{
    Params: { appId: string };
  }>("/admin/api/apps/:appId", async (request, reply) => {
    const { appId } = request.params;
    // ... call service, return response
  });
}
```

### Kysely Transaction with Multi-Table Delete
```typescript
// Source: Kysely Context7 + codebase pattern from snapshots.ts
await db.transaction().execute(async (trx) => {
  await trx.deleteFrom("app_delivered_files").where("app_id", "=", appId).execute();
  await trx.deleteFrom("app_repositories").where("app_id", "=", appId).execute();
  await trx.deleteFrom("apps").where("app_id", "=", appId).execute();
});
```

### BullMQ Job Removal by ID
```typescript
// Source: BullMQ Context7 docs
const queue = getQueue();
const job = await queue.getJob(jobId);
if (job) {
  const state = await job.getState();
  if (state === "waiting" || state === "delayed") {
    await job.remove();
  }
}
```

### Worker Existence Check
```typescript
// Source: codebase db pattern
const appStillExists = await getDatabase()
  .selectFrom("apps")
  .select("app_id")
  .where("app_id", "=", app_id)
  .executeTakeFirst();

if (!appStillExists) {
  console.log(`[${app_name}-${app_id}] App deleted, aborting job`);
  return; // Clean completion
}
```

## FK Constraint Map (Critical Reference)

Understanding the FK relationships is essential for correct delete ordering:

| Table | FK Column | References | ON DELETE |
|-------|-----------|------------|-----------|
| `app_repositories` | `app_id` | `apps(app_id)` | **NO CASCADE** (must delete manually before `apps`) |
| `app_repositories` | `repository_id` | `repositories(repository_id)` | **NO CASCADE** |
| `app_delivered_files` | `app_id` | `apps(app_id)` | **CASCADE** (auto-deleted when app row deleted) |
| `app_delivered_files` | `repository_id` | `repositories(repository_id)` | **CASCADE** |
| `repository_snapshots` | `repository_id` | `repositories(repository_id)` | **NO CASCADE** |
| `snapshot_files` | `snapshot_id` | `repository_snapshots(id)` | **CASCADE** |

**Safe delete order for an app:**
1. `app_delivered_files` WHERE app_id = X (explicit, even though CASCADE would handle it)
2. `app_repositories` WHERE app_id = X (MUST be explicit -- no CASCADE)
3. `apps` WHERE app_id = X

**Safe delete order for an orphaned repository:**
1. `repository_snapshots` WHERE repository_id = X (CASCADE handles `snapshot_files`)
2. `repositories` WHERE repository_id = X

Both of these are already implemented: order #2 is in `deleteRepository()` from `repositories.ts`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-repo unwatch only | Full app deletion with cascade | This phase | First time an entire app can be removed |

**Deprecated/outdated:**
- Nothing deprecated. This is new functionality.

## Open Questions

1. **Exact placement of worker existence check**
   - What we know: Must be before saving snapshot, recording deliveries, and updating status (the "commit results" phase)
   - What's unclear: Should it be right before step 5 (send notifications), or right before step 6 (save snapshot)? Sending notifications to a deleted app's webhook URL is wasted work but harmless.
   - Recommendation: Place the check right before step 5 (sending notifications). If the app is gone, there is no point sending webhooks to a URL that no longer cares. This also avoids recording deliveries for a deleted app. The check is a single SELECT so negligible cost.

2. **Response format for successful deletion**
   - What we know: CONTEXT.md says Claude's discretion. Existing unwatch route uses 204 No Content.
   - Recommendation: Use `200 OK` with a summary body `{ deleted: { app_id, repositories_unlinked, orphaned_repositories_cleaned } }` so the admin dashboard (Phase 13) has feedback to display. A 204 would work too but provides no actionable information for the UI.

## Sources

### Primary (HIGH confidence)
- Kysely Context7 `/kysely-org/kysely` - transaction patterns, deleteFrom syntax
- BullMQ Context7 `/taskforcesh/bullmq` - job removal by ID, queue.getJob, job.getState, job.remove
- Codebase direct inspection - all FK constraints from Liquibase migrations, existing patterns in `repository-management.ts`, `admin-actions.ts`, `snapshot.worker.ts`

### Secondary (MEDIUM confidence)
- None needed -- all findings verified from primary sources

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing dependencies
- Architecture: HIGH - patterns directly derived from existing codebase code
- Pitfalls: HIGH - FK constraints verified from Liquibase migration files, worker behavior verified from source code

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable -- no external dependency changes expected)
