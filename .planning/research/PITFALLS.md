# Pitfalls Research

**Domain:** v1.2 Hardening — Race Condition Fix, Admin Onboarding Auth, App Cascade Delete
**Researched:** 2026-02-24
**Confidence:** HIGH (based on direct codebase analysis + verified patterns)

---

## Critical Pitfalls

### Pitfall 1: Concurrent Git Operations Corrupting the Shared Clone Directory

**What goes wrong:**
Two BullMQ workers process jobs for `app-A` and `app-B`, both watching `github.com/owner/repo`. Both call `cloneOrPull("owner", "repo", tokenA)` and `cloneOrPull("owner", "repo", tokenB)` at the same time. They both detect `/data/repos/owner/repo/.git` exists (or neither does), then race to run `git remote set-url` + `git fetch` + `git reset --hard` — or a simultaneous `git clone`. The result: one process's `remote set-url` overwrites the other's token, the filesystem is in a partially-written state, or git's own index lock (`index.lock`) triggers an error that propagates through the job as an opaque "another git process seems to be running" failure. This is a silent data corruption risk: the clone may succeed with the wrong token, causing auth failures that appear to be GitHub API problems.

**Why it happens:**
`cloneOrPull` in `src/services/git.ts` is stateless — it checks `existsSync` and immediately acts. BullMQ `concurrency: 5` means up to five jobs run simultaneously in the same Node.js process. Jobs for the same repo (from different apps) share `/data/repos/{owner}/{repo}`, but there is no coordination between them. Git is not designed for concurrent access to the same working tree from separate processes.

**How to avoid:**
Use a per-repository mutex. The existing Redis connection (shared with BullMQ) makes Redis-based locking the natural choice. Lock key: `git-lock:{owner}:{repo}`. Use `ioredis` SET NX EX (or the `redlock` npm package) to acquire the lock before `cloneOrPull` and release it immediately after the git operation completes — before scanning, which is safe to parallelize. Lock TTL should be 2-5 minutes (longer than the worst-case git pull over a slow network). Design the scan/diff/notify steps to run without holding the lock, to minimize contention.

Alternative without a new dependency: use a Node.js in-process `Map<string, Promise>` to serialize git operations per repo key within a single worker. This is sufficient if only one worker process runs (current Docker deployment), but fails silently across multiple worker containers.

**Warning signs:**
- Sporadic `index.lock` errors in worker logs: "Another git process seems to be running in this repository"
- Auth errors appearing only when two apps with different tokens watch the same repo
- `git remote set-url` succeeds for one job, then the other job fails authentication on pull
- `cloneOrPull` occasionally completes with the wrong commit SHA

**Phase to address:**
Phase 1 (Race Condition Fix) — This is the primary reason v1.2 exists. Must be resolved before any other changes.

---

### Pitfall 2: Orphan Check Between DB Unlink and Filesystem Delete Has a Race Window

**What goes wrong:**
The `unwatchRepository` / cascade delete flow for app deletion follows: (1) unlink `app_id` from `app_repositories`, (2) call `isRepositoryOrphan(repositoryId)`, (3) if orphan, `deleteRepository` + `deleteLocalRepository`. Between steps 1 and 2, another request could add a new `app_repositories` row for the same `repository_id` (another app registering the same repo via `POST /api/repositories`). Step 2 then sees the new link and correctly reports "not orphan" — which is correct. But if two apps are deleted simultaneously (concurrent admin delete actions for two different apps, both watching the same repo), both can pass the orphan check concurrently, both attempt `deleteRepository` and `deleteLocalRepository`, and the second `rmSync` call will silently succeed (or fail, depending on timing) on an already-deleted directory.

**Why it happens:**
The orphan check in `repositories.ts::isRepositoryOrphan` is a `SELECT COUNT(*) FROM app_repositories WHERE repository_id = ?`. This is not atomic with the preceding delete in `app_repositories`. Without a database transaction wrapping the unlink + orphan check + repository delete, another process can observe the row count between steps. The current `unwatchRepository` service does not use a transaction.

**How to avoid:**
Wrap the entire unlink + orphan check + repository delete sequence in a single PostgreSQL transaction with `SELECT ... FOR UPDATE` on the `repositories` row. This ensures no concurrent transaction can modify `app_repositories` for the same `repository_id` during the check. The filesystem delete remains outside the transaction (fs operations cannot be transacted), but since the DB row is gone, any concurrent process will fail to find the repo and skip cleanup — which is acceptable. Make filesystem delete idempotent (check `existsSync` before `rmSync`, which `deleteLocalRepository` already does).

**Warning signs:**
- Double-delete error logs when two admins delete apps simultaneously (rare but possible)
- Repository row deleted from DB but local clone still present (or vice versa)
- `deleteRepository` throwing "repository not found" on the second concurrent call

**Phase to address:**
Phase 3 (App Deletion) — The transactional delete pattern must be implemented here. The single-app unwatch route also benefits from this fix.

---

### Pitfall 3: Deleting an App While Its Jobs Are In-Flight

**What goes wrong:**
Admin deletes app-A. The cascade delete removes: `app_repositories` rows, `app_delivered_files` rows for app-A, and optionally the `apps` row. Meanwhile, a BullMQ worker is actively processing a job with `app_id = app-A`. The job reads `app_id` and `repository_id` from `job.data` (copied at queue time), so it has the data it needs. But at job completion, it calls `updateAppRepositoryStatus(app_id, repository_id, "synced")` — which now targets a deleted row and silently updates 0 rows. It also calls `recordDelivery(app_id, repository_id, ...)` which inserts into `app_delivered_files`. If the FK constraint has `ON DELETE CASCADE`, the delivery row's parent (`apps.app_id`) no longer exists — and the insert fails with a foreign key violation error, causing the BullMQ job to fail and retry, indefinitely.

**Why it happens:**
BullMQ jobs carry their data payload at enqueue time. The job continues running after the app is deleted because BullMQ has no mechanism to cancel in-flight jobs by payload content. Database FK constraints enforce referential integrity, causing insert failures on delivery records pointing to deleted apps.

**How to avoid:**
Before deleting from `apps`, drain or cancel all queued/active jobs for the app. Use `queue.getJobs(['active', 'waiting', 'delayed'])` and filter by `job.data.app_id === appId`, then call `job.remove()` on waiting/delayed jobs. For active jobs, accept that they may fail — job failure on a deleted app is not harmful if the DB cascade already cleaned up the delivery records. Add a guard at the start of `processSnapshotJob`: after the initial status update, verify the app-repository link still exists; if not, exit gracefully without error. Alternatively, make `recordDelivery` resilient to missing FK by using `ON CONFLICT DO NOTHING` at the DB level for the case where the app no longer exists.

**Warning signs:**
- FK violation errors in worker logs after admin deletes an app: "insert into app_delivered_files violates foreign key constraint"
- Job retry loop for an app that no longer exists in the database
- BullMQ job count stays at "active" indefinitely after app deletion

**Phase to address:**
Phase 3 (App Deletion) — The job drain step and worker guard must be added as part of the delete implementation.

---

### Pitfall 4: Removing `publicAccess: true` Breaks Existing Registered Clients Immediately

**What goes wrong:**
`POST /api/apps/onboard` currently has `config: { publicAccess: true }`. Removing this flag (or replacing it with admin session auth) means any existing automation or developer script that calls onboard without admin credentials receives a 401 on the next deploy. This is a breaking change for any client that registered itself during initial setup using scripted onboarding. The change is not communicated in advance.

**Why it happens:**
The endpoint was intentionally public for self-service registration. Moving it behind admin auth changes the contract: it now requires an active admin session (cookie-based, browser-only) rather than being callable by scripts or CI pipelines. The existing `publicAccess: true` pattern in the auth plugin will treat the absence of this flag as "requires Bearer token," not "requires admin session." The two auth systems are independent, so a request with a valid Bearer token will NOT satisfy admin session auth.

**How to avoid:**
Implement admin auth on the onboard endpoint using the admin session check (matching the pattern in `dashboard-actions.ts`'s `onRequest` hook) — not by removing `publicAccess: true` from the client auth plugin, but by adding a new admin session gate. Keep the response format identical. Document the change in the docs site before deploying. Consider a transition period where both paths work simultaneously (admin session OR a one-time admin API key in a header) to allow existing automation to migrate. Update docs-site onboarding section to reflect that this is now an admin-only action.

**Warning signs:**
- Automated onboarding scripts fail post-deploy with 401
- New apps cannot be registered via API (only admin dashboard works)
- Confusion in `auth.ts`: the route is not `publicAccess: true` but also doesn't have a Bearer token, resulting in "Missing or invalid Authorization header" — wrong error message for admin context

**Phase to address:**
Phase 2 (Admin Onboarding Auth) — The auth mechanism change is isolated to this phase. The docs update is mandatory before deployment.

---

### Pitfall 5: Admin Session Auth Does Not Protect `POST /api/apps/onboard` From Bearer Token Bypass

**What goes wrong:**
The current `auth.ts` plugin checks all routes not marked `publicAccess: true` for a Bearer token. If the onboard route is changed to require admin session auth (not publicAccess), the `auth.ts` Bearer token check will still run first (it's registered as an `onRequest` hook before admin session logic). A request with a valid Bearer token from an existing app would pass the `auth.ts` check and reach the handler — bypassing admin session auth entirely. Result: any app that has a Bearer token can register new apps.

**Why it happens:**
The two auth systems in Docora are independent: `auth.ts` (Bearer, client API) and `admin-auth.ts` (session, `/admin/*` routes). The onboard route is at `/api/apps/onboard` — not under `/admin/*`. The admin session check in `admin-auth.ts` only runs for `/admin/*` paths. Adding admin auth to a non-`/admin` route requires explicit handling in the route itself (via a `preHandler` hook or inline session check), not just relying on the existing admin-auth plugin.

**How to avoid:**
Two design options:
1. Move onboarding to `/admin/api/apps/onboard` — it falls under the admin prefix, is protected by the existing admin session hook in `admin-auth.ts`, and the Bearer token auth in `auth.ts` skips `/admin/*` paths (already implemented). This is the cleaner option.
2. Add an explicit session check as a `preHandler` on the route, similar to the pattern in `dashboard-actions.ts`. Remove `publicAccess: true`, and do NOT rely on bearer token auth. This requires auditing that the global `auth.ts` hook will not intercept first.

Option 1 (move to `/admin/api/*`) is recommended because it uses the existing protection mechanism and avoids the ordering ambiguity.

**Warning signs:**
- curl with a valid Bearer token from any registered app successfully creates a new app via onboard
- Integration tests pass (they test the happy path) but security test with Bearer token also passes (it should not)
- Route shows up in Swagger docs under client API section, not admin section

**Phase to address:**
Phase 2 (Admin Onboarding Auth) — Must be resolved as the core design decision for this phase.

---

### Pitfall 6: App Deletion Does Not Stop the Scheduler From Re-Queueing Jobs

**What goes wrong:**
Admin deletes app-A. The cascade correctly removes `app_repositories` rows. But the scheduler runs on a `setInterval` every 60 seconds and calls `findRepositoriesForRescan()` — which queries `app_repositories`. Since the rows are deleted, the scheduler will not re-queue jobs for app-A. However: if the delete happens between the scheduler's DB query and the moment it calls `queue.add(jobId)`, the job gets added for an app that no longer exists. The job then runs, fails with FK violations, and enters the BullMQ retry loop with exponential backoff. After 5 retries (configured `attempts: 5`), BullMQ marks it as failed and keeps it in the failed job list indefinitely.

**Why it happens:**
The scheduler reads pending repos and immediately queues jobs. There is no lock or "is this app still alive?" check between the scheduler query and the queue add. Deletion is not signaled to the scheduler. The BullMQ job deduplication by `jobId` (`${app_id}-${repository_id}`) will not prevent this because the old job was already removed during cleanup.

**How to avoid:**
Add the "verify app-repo link still exists" guard at the start of `processSnapshotJob` (as mentioned in Pitfall 3). This single guard catches both the in-flight case and the scheduler-added-after-delete case. Optionally, as part of the deletion flow, remove any waiting/delayed BullMQ jobs with matching `app_id` before deleting DB rows — this minimizes noise in the failed jobs list.

**Warning signs:**
- Failed jobs in BullMQ for app IDs that no longer exist in the database
- Admin dashboard shows failed notifications for a deleted app (if the notifications table was not cascaded)
- Log entry: "App-repository link not found" in the worker (desired if you add the guard), vs. FK violation (current failure mode)

**Phase to address:**
Phase 3 (App Deletion) — The guard in the worker is a prerequisite for clean app deletion.

---

### Pitfall 7: Git Lock Mutex Not Released on Job Crash or BullMQ Retry

**What goes wrong:**
A Redis-based lock is acquired before `cloneOrPull`. The job crashes mid-operation (OOM, process kill, unhandled exception before the lock-release code runs). The lock remains in Redis until TTL expiry. During the TTL window, all other jobs for the same repo are blocked waiting for the lock. If the lock TTL is too long (e.g., 10 minutes), a single crash causes 10 minutes of stalled processing for all apps watching that repo.

**Why it happens:**
Redis locks with TTL are "fire and forget" on acquisition. If the process holding the lock dies before calling the release operation, the lock is only released when TTL expires. This is expected behavior for Redis locks, but the TTL must be calibrated carefully: too short risks releasing while a legitimate slow git operation is still running; too long causes stalls on crash.

**How to avoid:**
Set TTL to the 95th-percentile git operation time plus a safety margin. A typical `git fetch --depth 1` on a small repo takes under 30 seconds; large repos may take 2 minutes. Set TTL to 5 minutes as a conservative maximum. Implement lock extension (heartbeat) if the git operation is expected to take longer. Use `redlock`'s built-in TTL extension or implement a periodic `redis.expire(lockKey, ttl)` call during long operations. Log a warning when lock acquisition blocks for more than 30 seconds — this surfaces contention before it becomes a problem.

**Warning signs:**
- All jobs for a given `owner/repo` pause at exactly the same time
- "Lock acquisition timeout" or "waiting for lock" log entries clustered around a time when a worker was known to have crashed
- BullMQ job `stalled` state for the crashing job, lock still present in Redis

**Phase to address:**
Phase 1 (Race Condition Fix) — Lock lifecycle management is part of the mutex implementation.

---

### Pitfall 8: `app_repositories` FK Does Not Cascade — App Delete Fails or Leaves Orphan Links

**What goes wrong:**
The `app_repositories` table has `fk_app_repositories_app` referencing `apps(app_id)` (migration 002). The current migration does NOT specify `ON DELETE CASCADE`. If the delete implementation does `DELETE FROM apps WHERE app_id = ?` before cleaning up `app_repositories`, PostgreSQL raises a foreign key violation: "update or delete on table 'apps' violates foreign key constraint." Conversely, if the code manually deletes `app_repositories` first, but misses any table referencing `app_id` (future tables), the apps row can be deleted leaving silent orphans.

**Why it happens:**
Migration 002 creates FK constraints without `ON DELETE` behavior — PostgreSQL defaults to `RESTRICT`. The `app_delivered_files` migration (006) correctly uses `ON DELETE CASCADE`. But `app_repositories` does not. The cascade sequence matters: the application code must delete in dependency order (deliveries → app_repositories → apps), or a new migration must add `ON DELETE CASCADE` to `fk_app_repositories_app`.

**How to avoid:**
Add a Liquibase migration that drops and recreates the `fk_app_repositories_app` constraint with `ON DELETE CASCADE`. This makes the DB enforce referential integrity without application-level ordering. Alternatively, keep application-level ordering (deliveries → app_repositories → apps) in a single transaction. Do NOT mix: do not rely partly on DB cascade and partly on application ordering, as this causes subtle failures if the order ever changes. Verify the final delete sequence against the complete schema before implementing.

**Warning signs:**
- "violates foreign key constraint fk_app_repositories_app" when attempting `DELETE FROM apps`
- App row deleted but `app_repositories` rows remain (manually check after delete)
- Delete works in test (because test DB was created fresh with cascades) but fails in production (existing constraints without cascades)

**Phase to address:**
Phase 3 (App Deletion) — Requires a DB migration as part of the implementation plan.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-process Map mutex instead of Redis lock | No new dependency | Fails silently with multiple worker containers | Only if single worker is guaranteed forever |
| Soft-delete apps (mark deleted, don't remove rows) | Simpler, preserves history | Scheduler picks up "deleted" apps; FK issues accumulate | Never for Docora — no audit requirement exists |
| Skip draining BullMQ jobs on delete | Faster delete operation | Retry loops for deleted apps pollute job history and logs | Only if the worker guard is implemented first |
| Move onboard to `/admin/api` without updating docs | Fastest auth implementation | Existing users blocked immediately with no migration path | Never — document before deploying |
| Using `rmSync` without lock on filesystem delete | Simple implementation | Two concurrent deletes crash; git lock acquired by worker on deleted dir | Only if guaranteed no concurrent deletes |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Redis lock + BullMQ | Creating a separate Redis connection for locks | Reuse existing `getRedisConnection()` from `src/queue/connection.ts` |
| Git + concurrent jobs | Checking `existsSync` then acting without atomic check | Acquire lock before `existsSync`, hold through git operation completion |
| BullMQ job cancellation | Using `queue.drain()` which removes ALL jobs | Use `queue.getJobs(['waiting','delayed'])` filtered by `app_id`, remove individually |
| PostgreSQL cascade delete | Assuming FK cascade order is deterministic | Wrap in explicit transaction, delete in dependency order: deliveries → links → app |
| Admin session + client Bearer | Adding session check to `/api/*` route | Move admin-only endpoints to `/admin/api/*` prefix to use existing session middleware |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Lock acquired per git operation globally | All repos wait behind each other | Lock per `owner/repo`, not global | 2+ repos being processed simultaneously |
| Scanning all BullMQ jobs to find by `app_id` | `getJobs()` call takes seconds | BullMQ doesn't index by payload; keep a Redis set `pending-jobs:{app_id}` as a side index | > 500 waiting jobs in queue |
| Transaction wrapping filesystem delete | Transaction holds lock while `rmSync` runs | Commit DB changes, then delete filesystem (accept eventual consistency) | Large repos where `rmSync` takes seconds |
| Auth check on onboard queries all apps | `auth.ts` queries all apps on every unauthenticated request | Admin session check avoids this entirely | > 1,000 apps registered |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Moving onboard to `/admin/api` but forgetting to test Bearer token bypass | Any app token can create new apps | Write integration test: Bearer token on `/admin/api/apps/onboard` must return 401 |
| Redis lock key guessable or shared across tenants | Lock poisoning via crafted requests | Use internal lock key format `git-lock:{owner}:{repo}` — never expose lock keys externally |
| Admin delete without confirmation of cascade scope | Admin accidentally deletes shared repo data | Show the admin which repos will be affected before confirming, and warn if repo is shared |
| Filesystem delete without checking if another app still uses the directory | Race deletes a clone still being scanned | Always check `isRepositoryOrphan` in DB before `deleteLocalRepository` — DB is the source of truth |
| `ADMIN_SESSION_SECRET` not set in new environment | Admin auth routes return 503, onboard becomes effectively unprotected | Fail fast: if secret missing and onboard is admin-only, refuse to start server |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Delete app without showing what will be cascaded | Admin doesn't realize 3 repos will also lose their clones | Show modal: "This will remove: 2 repositories (clones preserved for other apps), 1 repo clone (no other watchers), all delivery history" |
| No feedback during app delete (it may take time) | Admin clicks delete again thinking it failed | Disable button, show progress spinner, confirm success/failure |
| Native HTML dialog for delete confirmation has no repo details | Admin cannot verify they're deleting the right app | Pass app name and repo count into the dialog before showing it |
| Onboard endpoint 401 with generic "Unauthorized" message | Developer doesn't know they need admin session | Return `{ error: "Admin authentication required. Use the admin dashboard to register apps." }` |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Race condition fix:** Lock released in the finally block (not just happy path) — verify by simulating a git error during lock hold
- [ ] **Race condition fix:** Lock TTL configured, not infinite — verify Redis key has TTL: `redis.ttl("git-lock:owner:repo")`
- [ ] **Onboard auth:** Bearer token on new endpoint returns 401 (not 200) — write an integration test for this exact case
- [ ] **Onboard auth:** Docs site onboarding page updated to reflect admin-only requirement
- [ ] **App deletion:** BullMQ waiting/delayed jobs for the deleted app removed before DB delete
- [ ] **App deletion:** Worker guard exits cleanly (not error) when app-repo link is missing mid-job
- [ ] **App deletion:** `app_repositories` FK has cascade — verify no FK violation with `DELETE FROM apps`
- [ ] **App deletion:** Shared repo clone NOT deleted when other apps still watch it — verify `isRepositoryOrphan` is checked
- [ ] **App deletion:** Dashboard confirmation dialog lists what will be deleted
- [ ] **Integration:** All three changes coexist — verify onboard behind admin auth does not affect the race condition fix or cascade delete

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Git index lock stuck after crash | LOW | `rm /data/repos/{owner}/{repo}/.git/index.lock`, trigger re-scan |
| Redis lock stuck after crash | LOW | `redis-cli DEL git-lock:{owner}:{repo}`, next scheduler cycle picks it up |
| App delete leaves orphan BullMQ jobs in retry loop | LOW | `queue.getJobs(['failed'])` filtered by app_id, `job.remove()` each |
| FK violation on app delete (no cascade migration) | MEDIUM | Manually delete in order: deliveries → app_repositories → apps; then add migration |
| Onboard endpoint locked behind admin with no docs update | MEDIUM | Hotfix: update docs, communicate to affected developers, optionally add temporary API key bypass |
| Shared repo clone deleted when still needed | HIGH | Re-register surviving app's repo (triggers fresh clone + full rescan, all files re-delivered as "created") |
| Bearer token bypasses admin onboard auth | HIGH | Immediate hotfix to move endpoint to `/admin/api` prefix; rotate any unintended app registrations |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Concurrent git corruption (Pitfall 1) | Phase 1 (Race Condition Fix) | Two jobs for same repo run simultaneously, no errors, correct SHA |
| Orphan check race window (Pitfall 2) | Phase 3 (App Deletion) | Concurrent delete of two apps sharing a repo — only one filesystem delete runs |
| In-flight job after app delete (Pitfall 3) | Phase 3 (App Deletion) | Delete app while job is active — job exits cleanly, no FK violation |
| Public client break on onboard auth change (Pitfall 4) | Phase 2 (Onboarding Auth) | Docs updated before deploy; existing automation migration path documented |
| Bearer token bypass on admin endpoint (Pitfall 5) | Phase 2 (Onboarding Auth) | Integration test: Bearer token on onboard endpoint returns 401 |
| Scheduler re-queues deleted app jobs (Pitfall 6) | Phase 3 (App Deletion) | Worker guard logs clean exit, no FK violation, job not retried |
| Lock not released on crash (Pitfall 7) | Phase 1 (Race Condition Fix) | Kill worker mid-git-op, verify lock TTL expires, next job acquires lock |
| FK constraint blocks app delete (Pitfall 8) | Phase 3 (App Deletion) | Migration adds CASCADE, DELETE FROM apps succeeds in one statement |

## Sources

- Direct codebase analysis: `src/services/git.ts`, `src/workers/snapshot.worker.ts`, `src/workers/snapshot.scheduler.ts`, `src/repositories/repositories.ts`, `src/services/repository-management.ts`, `src/plugins/auth.ts`, `src/plugins/admin-auth.ts`, `src/routes/apps/onboard.ts`
- Migration schema analysis: `deploy/liquibase/changelog/002-create-repositories-table.yml`, `006-app-delivered-files.yml`
- [BullMQ Concurrency docs](https://docs.bullmq.io/guide/workers/concurrency) — confirmed concurrency model
- [BullMQ Cancelling Jobs](https://docs.bullmq.io/guide/workers/cancelling-jobs) — `cancelJob()` and `queue.getJobs()`
- [BullMQ Stalled Jobs](https://docs.bullmq.io/guide/workers/stalled-jobs) — in-flight job behavior on crash
- [Concurrent git commands on same repo fail](https://github.com/SmartBear/git-en-boite/issues/211) — confirmed git is not safe for concurrent access to same working tree
- [Git index.lock error causes](https://dev.to/rijultp/fixing-common-git-lock-errors-understanding-and-recovering-from-gitindexlock-47ej) — lock file left on crash
- [Redis distributed locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — official Redlock guidance
- [node-redlock](https://github.com/mike-marcacci/node-redlock) — Node.js Redis lock implementation for single Redis instance (appropriate for Docora's single Redis)
- [PostgreSQL MVCC race conditions](https://bufisa.com/2025/07/17/handling-race-conditions-in-postgresql-mvcc/) — orphan check requires FOR UPDATE
- [Managing API breaking changes](https://www.theneo.io/blog/managing-api-changes-strategies) — deprecation timeline patterns

---
*Pitfalls research for: v1.2 Hardening & App Management (race condition, onboarding auth, cascade delete)*
*Researched: 2026-02-24*
