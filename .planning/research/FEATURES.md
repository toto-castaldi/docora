# Feature Research

**Domain:** Headless GitHub monitoring service — v1.2 Hardening & App Management
**Researched:** 2026-02-24
**Confidence:** HIGH (codebase read directly; patterns verified against official docs and community sources)

---

## Scope Note

This document was updated for the v1.2 milestone. The v1.0 research (admin dashboard, retry, queue visibility) is preserved below under "Prior Research — v1.0 Dashboard." The v1.2 section is the primary content for roadmap use.

---

## v1.2 Feature Landscape

### Table Stakes (Users Expect These)

Features that users of an admin-managed headless service assume are present. Missing these makes the system feel broken or insecure.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Protected onboarding endpoint | Any production service with a registration API must require auth; open onboarding lets anyone create apps | LOW | Auth check already exists for all other admin routes via session hook pattern in `dashboard-api.ts` and `dashboard-actions.ts` — same pattern applies to onboarding |
| App deletion with cascade | Admin dashboards are expected to support full lifecycle: create, view, delete. Inability to delete feels like a missing feature | MEDIUM | `unwatchRepository` service already implements the shared-resource-preservation logic per-link; app deletion is a loop over all links plus the final app record delete |
| No data corruption under concurrent git access | Workers running in parallel against the same filesystem path must not corrupt each other's git state | MEDIUM | Git's own index.lock detects concurrent writes but throws errors rather than queuing; app-level serialization is needed |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Smart cascade: preserve shared clones | Deleting an app that shares a repo with another app must not delete the filesystem clone — naive delete would break remaining watchers | MEDIUM | `isRepositoryOrphan()` already exists; reuse pattern from `unwatchRepository` service |
| Per-repo git lock (not global) | Serializing all git operations globally would kill throughput when watching many repos; per-repo locking allows parallelism across different repos while protecting shared ones | MEDIUM-HIGH | Requires keyed mutex map (Map<repoPath, Mutex>) in the git.ts module |
| Admin-only onboarding with clear HTTP semantics | Return 401 when no session; preserve existing SSRF check and validation logic; no regression on the client API bearer token flow | LOW | Existing `publicAccess: true` config flag is removed; session check added to the route's plugin scope |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Global git operation lock | Simplest fix for race condition — one mutex for all git ops | Eliminates parallelism; scanning 10 repos becomes sequential; unacceptable at any scale | Per-repo keyed mutex (Map<repoPath, Mutex>) |
| Soft delete for apps | Preserve history, allow "undo" | Soft-deleted app's jobs still get picked up by scheduler unless filtered everywhere; recovery is re-onboarding which is already possible | Hard delete with cascade; delivery history is already idempotent by design |
| Async/background app deletion | "Don't make the admin wait" | Introduces partial-delete state that is hard to observe and recover from; app shows as deleted but cleanup is still running | Synchronous cascade delete — at Docora's scale (one app's repos) this is fast enough |
| Client-facing self-delete API | Let apps delete themselves | Auth surface expansion; apps should not control their own lifecycle in an admin-only model | Admin-only DELETE endpoint only |
| Multi-step confirmation for onboarding auth | "Warn before locking it down" | No migration path needed — onboarding is admin-initiated in production already | Simply require admin session; update docs |

---

## Feature Dependencies

```
[Admin-only onboarding]
    requires --> [Admin session infrastructure] (already built, v1.0)
    requires --> [Remove publicAccess: true from onboard route]

[App deletion with cascade]
    requires --> [Admin session infrastructure] (already built, v1.0)
    requires --> [unwatchRepository service] (already built, reuse)
    requires --> [isRepositoryOrphan check] (already built, reuse)
    requires --> [deleteLocalRepository] (already built, reuse)
    requires --> [New: deleteApp repository function]
    enhances --> [Admin dashboard app detail page] (adds Delete button)

[Race condition fix — per-repo git lock]
    requires --> [cloneOrPull function in git.ts] (wrap with lock)
    conflicts --> [Global concurrency SCAN_CONCURRENCY=5] (must remain per-worker, not global)

[App deletion UI]
    requires --> [DELETE /admin/api/apps/:appId backend route]
    requires --> [Confirmation dialog] (native HTML dialog already used in project)
    enhances --> [Admin dashboard app detail page]
```

### Dependency Notes

- **Admin-only onboarding requires admin session infrastructure:** The session system is fully operational since v1.0. This is a one-line removal of `publicAccess: true` plus adding the session check to the route scope.
- **App deletion requires unwatchRepository reuse:** The existing `unwatchRepository` service in `src/services/repository-management.ts` implements per-link cleanup with orphan check. App deletion is a loop over all the app's links calling that service, then deleting the app record.
- **Race condition fix requires per-repo granularity:** A single global mutex would serialize all git operations. The correct pattern is a keyed structure where the lock key is the repository local path (e.g., `/data/repos/owner/name`). Different repos run in parallel; the same repo path is serialized.
- **Race condition fix and BullMQ deduplication are orthogonal:** BullMQ already uses `${app_id}-${repository_id}` as job IDs. This prevents duplicate jobs for the same app-repo pair but does NOT prevent two different apps watching the same repo from running git ops concurrently on the same filesystem path. The mutex fix is separate from deduplication.

---

## Feature Analysis: Per-Feature Breakdown

### Feature 1: Race Condition Fix on Shared Git Clone

**What goes wrong today:** Two apps (app_A with token_1, app_B with token_2) both watch `github.com/org/private-repo`. Their snapshot jobs run concurrently (SCAN_CONCURRENCY=5). Both call `cloneOrPull()` on the same local path `/data/repos/org/private-repo`. Job A does `git remote set-url origin token_1@github.com/...` while Job B is mid-fetch with token_2's URL. Result: wrong-token fetch, or git index.lock error. Either way: corrupted state, job failure, spurious auth error.

**Expected behavior:** Jobs for the same repository path are serialized at the git-operation boundary. Jobs for different repository paths run in parallel. Token used is always the one associated with the current job's app, not whatever was last set by another job.

**How it works in practice:**
- In-process keyed mutex: maintain a `Map<string, Mutex>` (module-level singleton in `git.ts`) where the key is the repo path. Acquire before git ops, release in `finally`. (HIGH confidence — async-mutex docs + standard Node.js pattern)
- `async-mutex` npm package provides `Mutex` with `runExclusive()` — simplest, no Redis dependency, no TTL management, handles concurrent acquires with a queue. (HIGH confidence — official npm docs)
- For single-process deployments (current Docker Compose setup), in-process mutex is correct and sufficient.
- For multi-process deployments: Redis-based semaphore via `redis-semaphore` (ioredis-compatible) is the upgrade path. Redis already available. (MEDIUM confidence — redis-semaphore docs + ioredis compatibility verified)

**Docora's actual deployment model:** One worker process per docker-compose. `SCAN_CONCURRENCY=5` controls concurrent jobs within that one process. Multi-worker is supported in the codebase but not the default deployment. **Conclusion: in-process mutex (async-mutex) is the correct solution for v1.2.**

**Lock scope:** Wrap only the `cloneOrPull` call, not the entire snapshot job. Scanning, notification, and delivery proceed without the lock. This minimizes lock duration and maximizes throughput.

**Complexity:** MEDIUM. New dependency (`async-mutex`). Mutex map as module-level singleton in `git.ts`. Lock acquired before `cloneOrPull`, released in `finally`. Key must be the filesystem path, not the repository_id, to correctly identify the shared-path case.

---

### Feature 2: Admin-Only Onboarding

**What goes wrong today:** `POST /api/apps/onboard` has `config: { publicAccess: true }` set. The bearer-token auth plugin skips it. Anyone with network access can register a new client app, get a bearer token, and start watching repositories. Production security gap.

**Expected behavior:** Only an authenticated admin session can create new apps. Unauthenticated requests return 401. Existing client bearer tokens continue to work. SSRF validation and body validation remain intact.

**How it works in Fastify:**
- Scoped `addHook("onRequest", sessionCheck)` inside a Fastify plugin: all routes registered within that plugin inherit the check. This is the exact pattern already used in `dashboard-api.ts` (session check) and `dashboard-actions.ts` (session check). (HIGH confidence — Fastify encapsulation docs + codebase verified)
- The onboard route lives in `src/routes/apps/onboard.ts`. The `publicAccess: true` config was the original self-onboarding design decision. Removing it plus adding the session hook achieves the goal.
- Two implementation approaches: (a) move the onboard route into a new scoped plugin with the session hook — clean, follows existing admin route pattern; (b) add a per-route preHandler check directly — simpler but breaks the pattern. Approach (a) is preferred for consistency.

**Complexity:** LOW. Session infrastructure is fully operational. This is a route restructuring and config change, not a new system.

**Implementation note:** Documentation (`docs-site`) must reflect that onboarding requires admin credentials. The existing API docs describe the onboard endpoint as self-service — this must be updated.

---

### Feature 3: App Deletion with Cascade Cleanup

**What the admin needs:** Click "Delete App" in the dashboard, confirm in a dialog, the app and all its data disappear cleanly, repositories shared with other apps are preserved.

**Expected behavior (complete cascade order):**

```
For each repository linked to the app:
  1. Delete app_delivered_files WHERE app_id = ? AND repository_id = ?
  2. Delete app_repositories WHERE app_id = ? AND repository_id = ?
  3. Check if repository has any remaining app_repositories links
  4. If orphaned:
       a. Delete snapshot_files WHERE snapshot_id IN (snapshots for this repo)
       b. Delete repository_snapshots WHERE repository_id = ?
       c. Delete repositories WHERE repository_id = ?
       d. Delete local clone from filesystem (deleteLocalRepository)
  5. If not orphaned: leave repository, snapshots, and clone intact

Finally:
  6. Delete apps WHERE app_id = ?
```

**How it works in admin dashboards:**
- Synchronous cascade delete is standard for this scale. The operation is DB deletes plus optional filesystem rm. No async background needed — these are fast operations. (MEDIUM confidence — Argo CD app deletion pattern, brandur.org hard-delete analysis)
- The `unwatchRepository` service in `src/services/repository-management.ts` already implements steps 1-4 for a single link. App deletion reuses this service. (HIGH confidence — codebase read directly)
- Shared resource preservation via orphan check is already the established pattern in Docora. (HIGH confidence — codebase verified: `isRepositoryOrphan` and `deleteRepository` exist and are tested by the existing unwatch flow)

**What is new (not already built):**
- `deleteApp(appId)` function in `src/repositories/apps.ts`
- `deleteAppWithCascade(appId)` service function that loops over all links, calls `unwatchRepository` for each, then calls `deleteApp`
- `DELETE /admin/api/apps/:appId` route in the admin routes
- Delete button + confirmation dialog in the React dashboard app detail page

**Complexity:** MEDIUM. Backend logic is largely composition of existing pieces. New pieces are thin wrappers. Frontend adds a confirmation-gated destructive action (the native HTML dialog pattern is already used in the project).

**Active job race:** If a snapshot job is running when the app is deleted, the job may try to call `updateAppRepositoryStatus` after the `app_repositories` row is gone. This will be a silent no-op (Kysely update with no matching rows), and BullMQ will mark the job as failed. This is acceptable behavior for v1.2 — the job was for a deleted app and its failure has no impact. Cancelling BullMQ jobs proactively before deletion is a P3 enhancement.

---

## MVP Definition for v1.2

### Launch With (All Three Are Required for the Milestone)

- [ ] **Race condition fix (per-repo mutex)** — Required for correctness when multiple apps watch the same private repo
- [ ] **Admin-only onboarding** — Required for security; open onboarding is a production security gap
- [ ] **App deletion with cascade** — Required for admin lifecycle management; no delete = incomplete admin dashboard

### Add After Validation (Post v1.2)

- [ ] **Multi-process Redis-based lock for git ops** — Trigger: if multi-worker deployment becomes active; in-process mutex is sufficient for current single-worker Docker deployment
- [ ] **Cancellation of active BullMQ jobs on app deletion** — Trigger: if concurrent delete + active job races cause observable errors in production
- [ ] **Onboarding audit log** — Trigger: if compliance requirements emerge

### Future Consideration (v2+)

- [ ] **Client self-service app deletion** — Requires separate auth model
- [ ] **Soft delete / recycle bin for apps** — Only worth building if accidental deletion becomes a real problem

---

## Feature Prioritization Matrix (v1.2)

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Admin-only onboarding | HIGH (security) | LOW (session check already exists) | P1 |
| App deletion with cascade | HIGH (admin lifecycle) | MEDIUM (reuse existing services) | P1 |
| Race condition fix (per-repo mutex) | HIGH (correctness) | MEDIUM (new mutex layer in git.ts) | P1 |
| Redis-based distributed lock (multi-worker) | MEDIUM | MEDIUM-HIGH | P2 (post-v1.2) |
| BullMQ job cancellation on delete | LOW (edge case) | MEDIUM | P3 |

All three P1 features are required for v1.2. They have no dependencies on each other and can be implemented in any order or in parallel.

---

## Sources (v1.2 Research)

- Fastify encapsulation and hooks: https://fastify.dev/docs/latest/Reference/Encapsulation/ and https://fastify.dev/docs/latest/Reference/Hooks/
- BullMQ deduplication: https://docs.bullmq.io/guide/jobs/deduplication
- BullMQ concurrency: https://docs.bullmq.io/guide/workers/concurrency
- async-mutex (in-process mutex for Node.js): https://www.npmjs.com/package/async-mutex
- redis-semaphore (distributed per-key mutex over ioredis): https://github.com/swarthy/redis-semaphore
- Git concurrent access safety (index.lock behavior): https://github.com/gitpython-developers/GitPython/issues/714
- GitHub blog on Git concurrency: https://github.blog/2015-10-20-git-concurrency-in-github-desktop/
- Cascade delete UI patterns (Argo CD): https://argo-cd.readthedocs.io/en/latest/user-guide/app_deletion/
- Soft delete analysis: https://brandur.org/soft-deletion
- Codebase: `/home/toto/scm-projects/docora/src/` (read directly, HIGH confidence)

---

---

## Prior Research — v1.0 Dashboard

*Original research dated 2026-01-26. Preserved for historical reference.*

**Domain:** Admin Monitoring Dashboard for Webhook/Job Queue Service
**Researched:** 2026-01-26
**Confidence:** MEDIUM

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **View failed notifications** | Core problem to solve — see failures before clients complain | LOW | Query `app_repositories` where `status='failed'`, display `last_error` |
| **Retry failed notifications** | Useless to see failures if you can't fix them | LOW | Reset status to `pending_snapshot` triggers re-scan |
| **View job queue status** | Must know if system is healthy (backed up, stuck, processing) | LOW | BullMQ provides `getJobCounts()` — pending, active, completed, failed |
| **View registered apps** | Need to see who is using the system | LOW | Query `apps` table |
| **View repositories per app** | Understand what each app monitors | LOW | Query `app_repositories` joined with `repositories` |
| **View delivery status** | Know if notifications reached clients successfully | LOW | Query `app_repositories.status` — synced/failed/pending/scanning |
| **Basic authentication** | Dashboard must be protected | MEDIUM | Username/password, session |
| **Error details display** | "Failed" is useless without knowing why | LOW | Display `last_error` from `app_repositories` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Bulk retry** | Retry all failed notifications in one click | LOW | Batch update all `status='failed'` to `pending_snapshot` |
| **Circuit breaker status** | See which repos have Git issues paused | LOW | Query `repositories.circuit_open_until` |
| **Force full re-sync** | Trigger complete re-scan of a repository for an app | LOW | Clear `app_delivered_files`, reset status |
| **Retry count visibility** | See how many times a notification has been retried | LOW | Display `app_repositories.retry_count` |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time WebSocket updates** | Feels more "modern" | Adds complexity, polling every 30s is fine for single admin | Poll on interval, manual refresh button |
| **Detailed job payload inspection** | Debug by seeing exact data sent | Security risk (exposes file contents, tokens) | Show metadata only (path, sha, timestamps) |
| **Multi-user admin with roles** | "Enterprise" feature request | Overkill for single-developer use case | Single admin account |
| **Email/Slack alerts** | Proactive notifications | Adds external dependencies | v2 feature if needed |

---

*Feature research for: Docora v1.2 Hardening & App Management*
*Researched: 2026-02-24*
