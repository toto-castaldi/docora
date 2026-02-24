# Architecture Research

**Domain:** Docora v1.2 — Race Condition Fix, Admin-Only Onboarding, App Deletion
**Researched:** 2026-02-24
**Confidence:** HIGH (based on direct codebase inspection of all affected files)

---

## Current System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Fastify Server                               │
├─────────────────────────┬────────────────────────────────────────────┤
│  Client API (Bearer)    │         Admin API (Session)                │
│  POST /api/apps/onboard │  GET/POST /admin/api/apps                  │
│  POST /api/repositories │  POST /admin/api/retry                     │
│  DELETE /api/repos/:id  │  POST /admin/api/resync                    │
│  PATCH /api/repos/:id   │  POST /admin/api/retry/app/:id             │
├─────────────────────────┴────────────────────────────────────────────┤
│                       Plugins Layer                                  │
│  auth.ts (bearer)    admin-session hook    swagger.ts                │
├──────────────────────────────────────────────────────────────────────┤
│                       Services Layer                                 │
│  git.ts  scanner.ts  notifier.ts  change-detector.ts                 │
│  chunked-notifier.ts  failure-notifier.ts  repository-management.ts  │
│  admin-actions.ts  bulk-progress.ts                                  │
├──────────────────────────────────────────────────────────────────────┤
│                    Repositories Layer (Kysely)                       │
│  apps.ts  repositories.ts  snapshots.ts  deliveries.ts               │
│  admin-dashboard.ts                                                  │
├──────────────────────────────────────────────────────────────────────┤
│         PostgreSQL              │         Redis (BullMQ)             │
│  apps                          │  snapshot-queue                    │
│  repositories                  │  session store                     │
│  app_repositories              │  bulk-progress hashes              │
│  repository_snapshots          │                                    │
│  snapshot_files                │                                    │
│  app_delivered_files           │                                    │
└────────────────────────────────┴────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         BullMQ Worker                                │
│  snapshot.scheduler.ts → snapshot.worker.ts (concurrency=5)         │
│  Jobs keyed as: {app_id}-{repository_id}                            │
│  Flow: cloneOrPull → scan → diff → notify → saveSnapshot            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    React Dashboard (SPA)                             │
│  TanStack Query + polling  /admin/* routes → Fastify static serve   │
│  Pages: Apps, AppDetail, Notifications, Queue, Overview              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Feature 1: Race Condition Fix

### The Problem

`cloneOrPull` in `src/services/git.ts` uses the filesystem path `/data/repos/{owner}/{repo}` as
the physical identity for a repository. When two apps (app_A and app_B) watch the same private
GitHub repo with different tokens, the scheduler produces two separate BullMQ jobs:

```
job: app_A-repo_X  (token A)
job: app_B-repo_X  (token B)
```

BullMQ runs both concurrently (concurrency=5). Both call `cloneOrPull(githubUrl, owner, name, token)`.
The second job to reach the git operation calls `git.remote(["set-url", "origin", <new-token-url>])`
while the first may be mid-way through `fetch`/`reset --hard`. Git operations on the same directory
from two concurrent Node.js promises are not atomic and can corrupt the working tree or produce
inconsistent scan results.

### Root Cause Location

`src/workers/snapshot.worker.ts` line 170: `cloneOrPull` is called with a per-app token but
operates on a shared filesystem path derived only from `{owner}/{repo}`.

### Architecture Decision: Per-Repository Path Lock

The correct fix is a path-scoped in-process mutex that serializes all git operations targeting
the same `{owner}/{repo}` filesystem path. The scan step (read-only) can proceed in parallel
after the git operation completes; the lock is only held during `cloneOrPull`.

An in-process `Map<string, Promise<CloneResult>>` is sufficient because:
- BullMQ concurrency=5 runs all concurrent jobs in the same Node.js process
- The scheduler already deduplicates at the job level by `{app_id}-{repository_id}` jobId
- Two jobs for the same repo but different apps share the same worker process

For multi-worker deployments a Redis-based distributed lock would be needed, but that is
out of scope for v1.2 (single-worker production deployment).

**New component:** `src/services/git-lock.ts`

```typescript
// Serializes concurrent git operations on the same repo path.
// Returns the shared in-flight clone result to all waiters.
const inflightOps = new Map<string, Promise<CloneResult>>();

export async function cloneOrPullWithLock(
  githubUrl: string,
  owner: string,
  name: string,
  githubToken?: string
): Promise<CloneResult> {
  const key = `${owner}/${name}`;
  const existing = inflightOps.get(key);
  if (existing) {
    return existing; // Await the in-flight result — same commit SHA, no re-clone
  }
  const op = cloneOrPull(githubUrl, owner, name, githubToken)
    .finally(() => inflightOps.delete(key));
  inflightOps.set(key, op);
  return op;
}
```

**Token selection consequence:** When two jobs race on the same repo path, only the first
caller's token is used for that git operation. Both jobs will scan the same resulting file
tree. This is correct — the repo content is the same regardless of which valid token is used.

### What Changes vs. What Is New

| Component | Status | Change |
|-----------|--------|--------|
| `src/services/git.ts` | UNCHANGED | No modification needed |
| `src/services/git-lock.ts` | NEW | Mutex wrapper around `cloneOrPull` |
| `src/workers/snapshot.worker.ts` | MODIFIED | Replace `cloneOrPull` call with `cloneOrPullWithLock` |

---

## Feature 2: Admin-Only Onboarding

### The Problem

`src/routes/apps/onboard.ts` declares `config: { publicAccess: true }`, which instructs
`src/plugins/auth.ts` to skip bearer token validation. Anyone who can reach the endpoint
can register a new app and obtain a bearer token — no credentials required.

### Current Auth Architecture

Two independent auth systems coexist:

- **Bearer auth** (`src/plugins/auth.ts`): Global `onRequest` hook that skips `/admin/*` paths
  and any route with `publicAccess: true`. Applied to all non-admin, non-public routes.
- **Session auth** (`src/routes/admin/dashboard-api.ts`, `dashboard-actions.ts`): Scoped
  `onRequest` hooks inside Fastify plugin registrations that check `request.session.get("adminId")`.
  Applied only to admin sub-routes.

### Integration Approach

Keep `config: { publicAccess: true }` so bearer auth continues to skip this route (the
onboarding caller has no token yet). Add a session guard check at the top of the route handler:

```typescript
// src/routes/apps/onboard.ts — handler change only
async (request, reply) => {
  // Require admin session — onboarding is now admin-controlled
  if (!request.session?.get("adminId")) {
    return reply.status(401).send({ error: "Admin authentication required" });
  }

  // Existing SSRF check
  const urlCheck = isUrlSafe(body.base_url);
  if (!urlCheck.safe) {
    return reply.status(422).send({ error: urlCheck.reason });
  }

  const result = await createApp(body);
  return reply.status(201).send(result);
}
```

This approach is chosen over moving the endpoint to `/admin/api/apps/onboard` because:
- No URL change = no breaking change for any existing workflow
- Minimum diff — one guard added at the top of one handler
- Consistent with how `dashboard-actions.ts` handles session auth in handlers

### What Changes vs. What Is New

| Component | Status | Change |
|-----------|--------|--------|
| `src/routes/apps/onboard.ts` | MODIFIED | Add `request.session?.get("adminId")` guard |
| `src/plugins/auth.ts` | UNCHANGED | Bearer auth already skips `publicAccess` routes |
| Dashboard React SPA | UNCHANGED | Onboarding is admin CLI/API only, no UI needed |

---

## Feature 3: App Deletion

### Cascade Logic

The cascade for deleting an app follows the same pattern as the existing `unwatchRepository`
service (`src/services/repository-management.ts`), but operates at the app level.

**Critical constraint:** Shared repositories watched by multiple apps must not have their
local clone deleted when only one app is removed.

**Database FK structure relevant to deletion:**

```
apps
  └── app_repositories  (FK app_id → apps.app_id)
        └── app_delivered_files  (FK app_id → apps.app_id, onDelete: CASCADE — migration 006)

repositories
  └── app_repositories  (FK repository_id → repositories.repository_id)
  └── repository_snapshots  (FK repository_id → repositories.repository_id)
        └── snapshot_files  (FK snapshot_id → repository_snapshots.id)
  └── app_delivered_files  (FK repository_id → repositories.repository_id, onDelete: CASCADE)
```

**Deletion sequence:**

1. Fetch all `app_repositories` rows for the app (to know which repos to check for orphan status)
2. For each linked repository: call `unwatchRepository(appId, repositoryId)`, which:
   - Unlinks the app from the repository (`deleteFrom app_repositories`)
   - Clears delivery records (`deleteFrom app_delivered_files WHERE app_id AND repository_id`)
   - Checks `isRepositoryOrphan(repositoryId)` — counts remaining `app_repositories` rows
   - If orphan: calls `deleteRepository(repositoryId)` (removes `repository_snapshots` + `snapshot_files`),
     then `deleteLocalRepository(owner, name)` (removes filesystem clone)
3. Delete the `apps` row — DB cascade removes any remaining `app_delivered_files` for the app

No new database migration is required. All FK cascade behaviors are already configured.

### New and Modified Components

**`src/repositories/apps.ts` — add `deleteApp` function:**

```typescript
export async function deleteApp(appId: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db
    .deleteFrom("apps")
    .where("app_id", "=", appId)
    .executeTakeFirst();
  return (result.numDeletedRows ?? BigInt(0)) > BigInt(0);
}
```

**`src/services/app-management.ts` — NEW FILE:**

Orchestrates the full cascade, reusing existing `unwatchRepository` and `deleteApp`.

```typescript
export async function deleteAppWithCascade(appId: string): Promise<boolean> {
  const repos = await findRepositoriesByAppId(appId);
  for (const repo of repos) {
    await unwatchRepository(appId, repo.repository_id);
  }
  return deleteApp(appId);
}
```

**`src/routes/admin/dashboard-api-apps.ts` — add DELETE endpoint:**

```typescript
// DELETE /admin/api/apps/:appId
server.delete<{
  Params: { appId: string };
  Reply: ApiResponse<{ message: string }> | ApiErrorResponse;
}>("/admin/api/apps/:appId", async (request, reply) => {
  const deleted = await deleteAppWithCascade(request.params.appId);
  if (!deleted) {
    return reply.code(404).send({ error: "App not found" });
  }
  return reply.send({ data: { message: "App deleted" } });
});
```

This route lives inside `dashboardApiRoutes`, which already has session auth via its scoped
`onRequest` hook. No additional auth logic is required in the route itself.

**Dashboard UI additions:**

- `dashboard/src/api/admin.ts` — add `deleteApp(appId: string)` calling `DELETE /admin/api/apps/:appId`
- `dashboard/src/pages/Apps.tsx` — add delete action per row using existing `ConfirmDialog` (`variant="danger"`)
- `dashboard/src/pages/AppDetail.tsx` — add delete button in header; on success navigate to `/apps`

**`packages/shared-types/src/dashboard.ts` — UNCHANGED.** No new types needed; the delete
response uses the existing `ApiResponse<{ message: string }>` pattern.

### What Changes vs. What Is New

| Component | Status | Change |
|-----------|--------|--------|
| `src/repositories/apps.ts` | MODIFIED | Add `deleteApp(appId)` |
| `src/services/app-management.ts` | NEW | `deleteAppWithCascade` orchestration |
| `src/routes/admin/dashboard-api-apps.ts` | MODIFIED | Add `DELETE /admin/api/apps/:appId` |
| `src/routes/admin/index.ts` | UNCHANGED | Already wires `dashboardApiRoutes` |
| `packages/shared-types/src/dashboard.ts` | UNCHANGED | Existing types sufficient |
| `dashboard/src/api/admin.ts` | MODIFIED | Add `deleteApp` API call |
| `dashboard/src/pages/Apps.tsx` | MODIFIED | Delete button + `ConfirmDialog` per row |
| `dashboard/src/pages/AppDetail.tsx` | MODIFIED | Delete button in header + navigate-away |

---

## Data Flow Diagrams

### Race Condition Fix — Concurrent Jobs for Shared Repo

```
Scheduler:
  app_A watches repo_X (token A) → queues job app_A-repo_X
  app_B watches repo_X (token B) → queues job app_B-repo_X
       ↓
Worker (concurrency=5) picks up both jobs simultaneously
       ↓
Both call cloneOrPullWithLock("github.com/owner/repo", "owner", "repo", tokenA/B)
       ↓
git-lock.ts: inflightOps.get("owner/repo") ?
  First caller: No → cloneOrPull(tokenA) → set inflightOps["owner/repo"]
  Second caller: Yes → await same promise (no git op, same CloneResult returned)
       ↓
Both jobs receive same { localPath, commitSha, branch }
       ↓
Each job scans independently, compares against its own app_delivered_files,
sends its own notifications, saves snapshot independently
```

### Onboarding Protection — Request Flow

```
POST /api/apps/onboard
       ↓
auth.ts onRequest hook: publicAccess=true → SKIP bearer auth check
       ↓
onboard handler: request.session?.get("adminId") ?
  NO  → 401 "Admin authentication required"
  YES → isUrlSafe(base_url) → createApp(body) → 201
```

### App Deletion — Cascade Flow

```
Admin clicks "Delete App" in dashboard
       ↓
ConfirmDialog (variant="danger") — confirms intent
       ↓
DELETE /admin/api/apps/:appId
       ↓
dashboardApiRoutes onRequest hook: session.get("adminId") → pass
       ↓
deleteAppWithCascade(appId)  [src/services/app-management.ts]
       ↓
findRepositoriesByAppId(appId)  → SELECT from app_repositories JOIN repositories
       ↓ (for each linked repo)
unwatchRepository(appId, repoId)
  → unlinkAppFromRepository      DELETE FROM app_repositories
  → clearDeliveries              DELETE FROM app_delivered_files WHERE app_id AND repo_id
  → isRepositoryOrphan?
      YES → deleteRepository     DELETE repository_snapshots, snapshot_files, repositories
            deleteLocalRepository rm -rf /data/repos/{owner}/{name}
      NO  → leave clone intact (other apps still watch it)
       ↓
deleteApp(appId)               DELETE FROM apps WHERE app_id = ?
                               (DB cascade: remaining app_delivered_files via FK)
       ↓
204 / { data: { message: "App deleted" } }
       ↓
Dashboard: invalidate ["apps"] query → list updates
           navigate to /apps (if coming from AppDetail)
```

---

## Architectural Patterns Preserved

### Session Auth Scoping Pattern

Admin session checks live as `onRequest` hooks scoped inside Fastify plugin registrations
(`dashboardApiRoutes`, `dashboardActionRoutes`). New admin endpoints automatically inherit
this protection when registered inside those plugins. The app deletion route follows this
pattern — the DELETE handler needs no additional session check.

### Service Orchestration Pattern

Complex operations touching multiple repositories or the filesystem belong in `src/services/`
(established by `repository-management.ts`). The new `src/services/app-management.ts` follows
this pattern, keeping the route handler thin and the cascade logic testable in isolation.

### Orphan-Safe Deletion Pattern

Shared repositories must never have their local clone deleted when one app unsubscribes.
The `isRepositoryOrphan` check before `deleteRepository` + `deleteLocalRepository` is
enforced inside `unwatchRepository`. App deletion inherits this safety by reusing
`unwatchRepository` rather than implementing its own cascade.

### ConfirmDialog for Destructive Actions

Dashboard uses native HTML `<dialog>` via `ConfirmDialog` with `variant="danger"` for
irreversible actions. App deletion follows this pattern. No new UI library is needed.

---

## Suggested Build Order

### Phase 1 — Race Condition Fix (backend only, no DB, no UI)

Self-contained. No dependencies on other v1.2 features. Fixes the highest-severity issue first.

1. `src/services/git-lock.ts` — implement path-scoped mutex
2. `src/workers/snapshot.worker.ts` — swap `cloneOrPull` for `cloneOrPullWithLock`
3. Unit tests for lock serialization (two concurrent calls on same path → one git op)

### Phase 2 — Admin-Only Onboarding (backend only, no DB, no UI)

One-file change. No dependency on Phase 1 or Phase 3. Eliminates open registration endpoint.

1. `src/routes/apps/onboard.ts` — add session guard at top of handler
2. Tests: unauthenticated POST → 401; authenticated POST → 201

### Phase 3 — App Deletion Backend (no DB migration needed)

All FK cascades already exist. Backend must complete before dashboard UI can call it.

1. `src/repositories/apps.ts` — add `deleteApp`
2. `src/services/app-management.ts` — new file, `deleteAppWithCascade`
3. `src/routes/admin/dashboard-api-apps.ts` — add DELETE route
4. Tests: cascade with orphan repo (clone deleted), cascade with shared repo (clone preserved)

### Phase 4 — App Deletion Dashboard UI

Depends on Phase 3 backend being reachable.

1. `dashboard/src/api/admin.ts` — add `deleteApp`
2. `dashboard/src/pages/Apps.tsx` — delete action per row + confirm dialog
3. `dashboard/src/pages/AppDetail.tsx` — delete button in header + navigate-away on success

---

## Integration Points Summary

| Feature | New Files | Modified Files | Unchanged |
|---------|-----------|----------------|-----------|
| Race condition | `git-lock.ts` | `snapshot.worker.ts` | scheduler, DB, dashboard |
| Onboarding protection | none | `onboard.ts` (handler only) | auth plugin, all other routes |
| App deletion backend | `app-management.ts` | `apps.ts`, `dashboard-api-apps.ts` | scheduler, BullMQ, client API |
| App deletion UI | none | `admin.ts`, `Apps.tsx`, `AppDetail.tsx` | shared-types, server-side |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Deleting the Clone Before Orphan Check

**What people do:** Delete `deleteLocalRepository` at the same time as the app record,
without checking if other apps still reference the repository.

**Why it's wrong:** If app_B still watches the same repo, app_B's next scan will find no
local clone and must re-clone from scratch — wasting time and potentially hitting GitHub
rate limits.

**Do this instead:** Always call `isRepositoryOrphan(repositoryId)` before
`deleteLocalRepository`. The existing `unwatchRepository` service enforces this.
App deletion reuses `unwatchRepository` and inherits the protection.

### Anti-Pattern 2: Session Auth in a Global Hook for Client API Routes

**What people do:** Add session auth in a global `onRequest` hook covering `/api/*` routes
so all endpoints require admin login.

**Why it's wrong:** Client apps use bearer token auth, not session cookies. Requiring session
auth on client API routes breaks all existing client integrations.

**Do this instead:** Session auth lives inside scoped plugin registrations only. The
`publicAccess` flag on the onboard route plus a manual session check in the handler is the
minimum-change approach that keeps client bearer token paths unaffected.

### Anti-Pattern 3: Full Worker Mutex for Git Operations

**What people do:** Lock the entire worker from processing any job while any git operation
is running, to prevent concurrent filesystem access.

**Why it's wrong:** Repositories at different filesystem paths are completely independent.
Locking all of them together eliminates BullMQ's concurrency benefit entirely.

**Do this instead:** Lock at `{owner}/{name}` path granularity. Only jobs targeting the
same physical path are serialized.

### Anti-Pattern 4: Skipping ConfirmDialog for App Deletion

**What people do:** Fire deletion immediately on button click for speed.

**Why it's wrong:** App deletion is irreversible. The client app loses its bearer token,
its entire delivery history is erased, and all files would need to be re-sent on
re-registration.

**Do this instead:** Use `ConfirmDialog` with `variant="danger"` and describe the
consequence explicitly in the message body.

---

## Sources

- Direct codebase inspection (all findings are HIGH confidence):
  - `src/workers/snapshot.worker.ts` — job flow and `cloneOrPull` call site
  - `src/services/git.ts` — shared filesystem path derivation
  - `src/routes/apps/onboard.ts` — `publicAccess: true` declaration
  - `src/plugins/auth.ts` — bearer auth and `publicAccess` bypass logic
  - `src/routes/admin/dashboard-api.ts`, `dashboard-actions.ts` — session auth pattern
  - `src/services/repository-management.ts` — `unwatchRepository` + orphan-safe cascade
  - `src/repositories/apps.ts`, `repositories.ts`, `deliveries.ts` — Kysely data access
  - `deploy/liquibase/changelog/` (001–007) — DB schema and FK cascade definitions
  - `packages/shared-types/src/dashboard.ts` — existing type contracts
  - `dashboard/src/pages/AppDetail.tsx`, `Apps.tsx` — UI patterns and `ConfirmDialog` usage

---
*Architecture research for: Docora v1.2 Hardening & App Management*
*Researched: 2026-02-24*
