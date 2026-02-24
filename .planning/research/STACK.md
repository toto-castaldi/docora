# Stack Research

**Domain:** v1.2 Hardening — Git race condition fix, admin-only onboarding, app cascade delete
**Researched:** 2026-02-24
**Confidence:** HIGH

## Verdict: No New Core Dependencies Required

The three v1.2 features are implementable entirely within the existing stack. One optional
library (`async-mutex`) is recommended for the race condition fix. Cascade delete and admin
auth protection require zero new libraries — only a Liquibase migration and a route change.

---

## Feature 1: Race Condition Fix (Git Clone Mutex)

### Problem

`cloneOrPull()` in `src/services/git.ts` has no concurrency guard. BullMQ runs up to 5
concurrent jobs in the same Node.js event loop (async interleaving, not OS threads). When
two apps both watch the same repository, two jobs can enter `cloneOrPull()` for the same
local path simultaneously:

- Job A checks `existsSync(join(localPath, ".git"))` → false, proceeds to clone
- Job B checks the same path → false (A hasn't finished yet), also proceeds to clone
- Both call `git.clone()` to the same directory → filesystem corruption or EEXIST error

### Solution: Per-Key In-Process Mutex

Since BullMQ workers share one Node.js event loop (concurrency=5 means 5 interleaved async
operations, not 5 OS threads), an in-process `Map<string, Mutex>` keyed by repo local path
is the correct and sufficient solution. No Redis distributed lock is needed unless the
architecture moves to multiple worker processes on separate machines.

### Recommended Library: `async-mutex`

**Current version:** 0.5.0 (confirmed from npm registry, 2026-02-24)

**Why async-mutex:**
- Zero runtime dependencies (only tslib as peer, already transitively present)
- Native TypeScript types — no `@types/` package needed
- `runExclusive()` automatically releases the lock on resolve OR reject (no finally blocks)
- `Mutex` API is minimal: construct once, call `runExclusive`, done
- MIT license, active maintenance

**Why NOT async-lock v1.4.1:**
- JavaScript-only library, no built-in TypeScript types
- Has native per-key locking, but the API is callback-first with awkward async/await wrapping
- Extra complexity is unwarranted when a `Map<string, Mutex>` with async-mutex achieves the same

**Why NOT Redis distributed lock (redlock):**
- Docora's worker is a single process (concurrency=5 within one event loop)
- Redis round-trips on every git operation add latency with zero benefit
- Only warranted if deploying multiple worker processes on different machines

### Implementation Pattern

```typescript
import { Mutex } from "async-mutex";

// Module-level singleton, keyed by repo local path (e.g., "/data/repos/owner/name")
const repoLocks = new Map<string, Mutex>();

function getRepoMutex(repoPath: string): Mutex {
  if (!repoLocks.has(repoPath)) {
    repoLocks.set(repoPath, new Mutex());
  }
  return repoLocks.get(repoPath)!;
}

export async function cloneOrPull(
  githubUrl: string,
  owner: string,
  name: string,
  githubToken?: string
): Promise<CloneResult> {
  const localPath = getLocalRepoPath(owner, name);
  const mutex = getRepoMutex(localPath);

  return mutex.runExclusive(async () => {
    // ... existing clone/pull logic unchanged
  });
}
```

With concurrency=5, the Map will hold at most 5 entries at peak. Memory footprint is
negligible. Locks for repos no longer actively watched persist in memory but are harmless
(they are released Mutex objects consuming a few bytes each).

---

## Feature 2: Admin-Only Onboarding Endpoint

### Problem

`POST /api/apps/onboard` uses `config: { publicAccess: true }` which bypasses the bearer
token auth hook in `auth.ts`. Any caller on the internet can register an app. The admin
session auth in `admin-auth.ts` only protects `/admin/*` routes and does not cover
`/api/apps/onboard`.

### Solution: Move Route to `/admin/api/` Prefix

No new library needed. The existing admin session infrastructure already covers this.

**Recommended approach: relocate the route**

Change the route URL from `/api/apps/onboard` to `/admin/api/apps/onboard` and remove the
`config: { publicAccess: true }` flag. The `admin-auth.ts` `onRequest` hook fires for all
`/admin/*` requests and already checks `request.session?.adminId`. No additional code is
required.

**Why this approach over per-route preHandler:**
- The `admin-auth.ts` scoped hook is already the established pattern for admin-only routes
- Moving to `/admin/api/` communicates intent clearly (this is an admin operation)
- Avoids mixing admin session checks into bearer-token protected route space
- The dashboard frontend already calls `/admin/api/*` endpoints — one consistent namespace

**What needs updating:**
- Route URL in `src/routes/apps/onboard.ts`: `/api/apps/onboard` → `/admin/api/apps/onboard`
- Route registration in `src/routes/index.ts` or admin routes index
- Dashboard API client URL in `dashboard/src/api/` (if onboarding is called from dashboard)

### Existing Auth Infrastructure (no changes needed)

| Component | File | Role in v1.2 |
|-----------|------|--------------|
| `admin-auth.ts` plugin | `src/plugins/admin-auth.ts` | `onRequest` hook blocks unauthenticated `/admin/*` — zero changes |
| `@fastify/session` | package.json (already installed) | Session store reads `adminId` from Redis |
| `@fastify/cookie` | package.json (already installed) | Cookie parsing for session |
| `IoRedisSessionStore` | `src/plugins/admin-auth.ts` | Custom ioredis-backed session store |

---

## Feature 3: App Deletion with Cascade Cleanup

### Problem

No app deletion exists. Deleting an app requires cleaning up all dependent data:
1. `app_repositories` rows for the app (per-app repo links)
2. `app_delivered_files` rows for the app
3. For each repository that becomes orphan: `repository_snapshots`, `snapshot_files` (cascade from snapshots), `repositories` row
4. Local git clone — only if no other app watches that repo
5. Finally the `apps` row itself

### Current FK Cascade State

Verified from existing Liquibase migrations in `deploy/liquibase/changelog/`:

| FK Constraint | Table | Current onDelete | Action Needed |
|---------------|-------|-----------------|---------------|
| `fk_app_repositories_app` | `app_repositories.app_id → apps.app_id` | NONE (no cascade) | Add CASCADE |
| `fk_app_delivered_files_app` | `app_delivered_files.app_id → apps.app_id` | CASCADE (migration 006) | None |
| `fk_app_delivered_files_repo` | `app_delivered_files.repository_id → repositories.repository_id` | CASCADE (migration 006) | None |
| `fk_snapshots_repository` | `repository_snapshots.repository_id → repositories.repository_id` | NONE | None (handled in `deleteRepository()`) |
| `fk_snapshot_files_snapshot` | `snapshot_files.snapshot_id → repository_snapshots.id` | CASCADE via `deleteCascade: true` | None |

### Solution: One Liquibase Migration + Existing Application Logic

**Migration 008:** Drop and re-add `fk_app_repositories_app` with `onDelete: CASCADE`.

After this migration, a single `DELETE FROM apps WHERE app_id = ?` automatically removes
all `app_repositories` and `app_delivered_files` rows for that app.

The orphan-repository check and local clone deletion must remain in application code because:
- The "is this repo orphan?" decision requires checking cross-app state
- Local filesystem cleanup (`deleteLocalRepository`) cannot be expressed in a DB trigger
- The pattern already exists in `src/services/repository-management.ts`

**Application-level delete flow:**

```typescript
// Step 1: collect repo links before deletion (need owner/name for local path cleanup)
const repos = await db
  .selectFrom("app_repositories")
  .innerJoin("repositories", "repositories.repository_id", "app_repositories.repository_id")
  .select(["app_repositories.repository_id", "repositories.owner", "repositories.name"])
  .where("app_repositories.app_id", "=", appId)
  .execute();

// Step 2: delete the app — DB cascades to app_repositories and app_delivered_files
await db.deleteFrom("apps").where("app_id", "=", appId).execute();

// Step 3: for each formerly-linked repo, clean up orphans
for (const repo of repos) {
  const orphan = await isRepositoryOrphan(repo.repository_id);
  if (orphan) {
    await deleteRepository(repo.repository_id); // removes repository_snapshots + snapshot_files
    deleteLocalRepository(repo.owner, repo.name); // removes local clone
  }
}
```

No new Kysely APIs required. The existing `deleteFrom`, `selectFrom`, `innerJoin`, and the
helper functions in `src/repositories/repositories.ts` (`isRepositoryOrphan`,
`deleteRepository`) and `src/services/git.ts` (`deleteLocalRepository`) cover everything.

### Liquibase Migration 008 (YAML)

Pattern follows `006-app-delivered-files.yml` exactly:

```yaml
databaseChangeLog:
  - changeSet:
      id: 008-app-cascade-delete
      author: docora
      changes:
        - dropForeignKeyConstraint:
            baseTableName: app_repositories
            constraintName: fk_app_repositories_app
        - addForeignKeyConstraint:
            baseTableName: app_repositories
            baseColumnNames: app_id
            referencedTableName: apps
            referencedColumnNames: app_id
            constraintName: fk_app_repositories_app
            onDelete: CASCADE
```

---

## New Additions Summary

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `async-mutex` | 0.5.0 | Per-key in-process mutex for git operations | Required for the race condition fix in `src/services/git.ts` |

### Database Migrations

| Migration | Purpose | Pattern Used |
|-----------|---------|-------------|
| `008-app-cascade-delete.yml` | Add `ON DELETE CASCADE` to `fk_app_repositories_app` | `dropForeignKeyConstraint` + `addForeignKeyConstraint` with `onDelete: CASCADE` — same as migration 006 |

---

## Installation

```bash
# From the repo root — only new runtime dependency for v1.2
pnpm add async-mutex@0.5.0
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `redlock` (Redis distributed lock) | Single-process worker; Redis round-trips add latency with no benefit | `async-mutex` in-process Map |
| `async-lock` | JavaScript-only, no built-in TypeScript types | `async-mutex` with native TypeScript types |
| `@fastify/auth` plugin | Route-level auth decorators are overkill; the existing `onRequest` hook pattern covers all admin routes | Existing `admin-auth.ts` `onRequest` hook via URL relocation |
| New session middleware | Session auth is already fully implemented in `admin-auth.ts` | Move onboard route to `/admin/api/` prefix |
| Manual cascade delete loops for `app_repositories` | Error-prone, not atomic; a missing delete leaves orphaned rows | DB `ON DELETE CASCADE` via migration 008 |
| Application-level delete for `app_delivered_files` | Already has `ON DELETE CASCADE` from migration 006 — no app code needed | Existing DB constraint handles it |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `async-mutex` in-process Map | Redis `redlock` distributed lock | Use only when running multiple worker processes on separate machines sharing the same repo storage |
| Move onboard to `/admin/api/apps/onboard` | Add per-route `preHandler` session check at `/api/apps/onboard` | If the original URL must remain for backward compatibility with existing clients |
| DB `ON DELETE CASCADE` for `app_repositories` | Delete `app_repositories` rows before deleting `apps` in application code | When per-row logging or conditional deletion is needed |
| Collect repo IDs before app delete, check orphan after | DB trigger for orphan cleanup | PostgreSQL triggers cannot invoke filesystem operations; app logic is unavoidable for local clone deletion |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `async-mutex@0.5.0` | Node.js >= 22, TypeScript 5.x, ESM | Native ESM + CJS dual package. `tslib` peer dep already present transitively in the project. |
| `async-mutex@0.5.0` | BullMQ 5.x (same-process event loop concurrency) | Works correctly because BullMQ's `concurrency` option interleaves async jobs on one event loop — in-process mutexes are shared across all concurrent job executions. |

---

## Sources

- npm registry `async-mutex@0.5.0` — version, description, dependency count verified (HIGH confidence)
- GitHub `DirtyHairy/async-mutex` — API review: `Mutex`, `Semaphore`, `runExclusive`; no built-in keyed locking, pattern requires external Map (HIGH confidence)
- npm registry `async-lock@1.4.1` — confirmed JavaScript-only, per-key native, no TypeScript (HIGH confidence)
- `deploy/liquibase/changelog/006-app-delivered-files.yml` — confirmed `addForeignKeyConstraint` with `onDelete: CASCADE` pattern used in this codebase (HIGH confidence — direct code inspection)
- `deploy/liquibase/changelog/002-create-repositories-table.yml` — confirmed `fk_app_repositories_app` exists without `onDelete` cascade (HIGH confidence — direct code inspection)
- `src/plugins/admin-auth.ts` — confirmed `onRequest` hook guards all `/admin/*` routes (HIGH confidence — direct code inspection)
- `src/routes/apps/onboard.ts` — confirmed `publicAccess: true` flag bypasses bearer auth (HIGH confidence — direct code inspection)
- `src/services/repository-management.ts` — confirmed orphan-repo cleanup pattern (`isRepositoryOrphan`, `deleteRepository`, `deleteLocalRepository`) already implemented (HIGH confidence — direct code inspection)
- BullMQ concurrency docs — confirmed workers process multiple jobs in same event loop via async interleaving, not threads (MEDIUM confidence — docs describe behavior, Node.js single-thread model is well-established)
- Liquibase official docs `addForeignKeyConstraint` — confirmed `onDelete: CASCADE` YAML attribute and `dropForeignKeyConstraint` syntax (HIGH confidence)

---

*Stack research for: Docora v1.2 Hardening & App Management*
*Researched: 2026-02-24*
