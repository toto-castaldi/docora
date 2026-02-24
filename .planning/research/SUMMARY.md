# Project Research Summary

**Project:** Docora v1.2 — Hardening & App Management
**Domain:** Headless GitHub monitoring service — security hardening and admin lifecycle management
**Researched:** 2026-02-24
**Confidence:** HIGH

## Executive Summary

Docora v1.2 addresses three tightly scoped hardening concerns: a concurrency defect in the git clone layer, an open registration endpoint that constitutes a production security gap, and the absence of app deletion in an otherwise complete admin dashboard. All three issues are confirmed by direct codebase inspection and are implementable without new infrastructure — one optional library (`async-mutex`) is the only new runtime dependency. The recommended approach is to treat each feature as an independent, low-risk change that can be shipped sequentially or in parallel by separate developers.

The critical correctness issue is the race condition in `src/services/git.ts`: BullMQ runs up to five concurrent jobs in the same Node.js process, and two jobs for different apps watching the same GitHub repository will collide on the shared filesystem path `/data/repos/{owner}/{repo}`. The fix is a per-repository-path in-process mutex using `async-mutex@0.5.0`, implemented in a new `src/services/git-lock.ts` module that wraps only the `cloneOrPull` call. No Redis distributed lock is needed for the current single-worker Docker deployment. The security fix (admin-only onboarding) is a single handler change — adding a session guard at the top of `src/routes/apps/onboard.ts` while keeping `publicAccess: true` so the bearer-auth plugin is not affected. App deletion is a composition of existing services (`unwatchRepository`, `isRepositoryOrphan`) with a new thin orchestration layer in `src/services/app-management.ts`, a new `DELETE /admin/api/apps/:appId` route, and one Liquibase migration adding `ON DELETE CASCADE` to `app_repositories`.

The primary risks are: (1) orphan-check race window during concurrent app deletions — mitigated by wrapping the unlink + orphan check + repository delete sequence in a PostgreSQL transaction with `SELECT ... FOR UPDATE`; (2) in-flight BullMQ jobs for a deleted app causing FK violations — mitigated by adding an early-exit guard in `processSnapshotJob` that verifies the app-repository link still exists before proceeding; (3) the onboard auth change inadvertently allowing bearer token bypass — mitigated by adding the session check inside the handler rather than relying on URL-prefix routing, so both auth systems remain independent. All three pitfalls have clear, bounded fixes.

---

## Key Findings

### Recommended Stack

The v1.2 scope is implementable entirely within the existing stack. No new infrastructure, no new database engines, no new framework plugins. The single new runtime dependency is `async-mutex@0.5.0` (MIT, native TypeScript, zero transitive deps), chosen over Redis `redlock` (unnecessary for single-process) and `async-lock` (JavaScript-only, no built-in types). One Liquibase migration (008) adds `ON DELETE CASCADE` to the `fk_app_repositories_app` constraint following the same pattern as migration 006.

**Core technologies for v1.2 changes:**
- `async-mutex@0.5.0`: per-repository-path mutex — native TypeScript, `runExclusive()` auto-releases on both resolve and reject, correct for BullMQ single-process concurrency model
- `Liquibase YAML (migration 008)`: adds `ON DELETE CASCADE` to `app_repositories.app_id` FK — `dropForeignKeyConstraint` + `addForeignKeyConstraint` pattern already established in migration 006
- `@fastify/session` + `ioredis` session store: already installed; admin session auth for the onboard route requires zero new packages

**What NOT to add:**
- `redlock` — single-process worker; Redis round-trips add latency with no benefit
- `async-lock` — JavaScript-only, no built-in TypeScript types
- `@fastify/auth` — route-level auth decorators are overkill; existing `onRequest` hook pattern covers everything

### Expected Features

**Must have (table stakes — all three required for the v1.2 milestone):**
- Protected onboarding endpoint — open registration is a production security gap; admin session infrastructure already exists from v1.0
- App deletion with cascade cleanup — admin lifecycle is incomplete without delete; `unwatchRepository` service already implements shared-resource-preservation logic
- Concurrent git access serialization — correctness defect; two apps sharing a private repo currently produce a race condition that corrupts git state or causes wrong-token fetches

**Should have (differentiators that come with correct implementation):**
- Per-repo git lock, not global — per-path granularity (Map keyed by `{owner}/{name}`) preserves BullMQ parallelism across different repos while serializing operations on the same path
- Smart cascade preserving shared clones — `isRepositoryOrphan()` check before `deleteLocalRepository` prevents breaking other watchers
- Contextual 401 error message on onboard — direct guidance avoids developer confusion when automation breaks

**Defer to post-v1.2:**
- Redis-based distributed git lock (multi-worker deployment) — in-process mutex is sufficient for current single-worker Docker Compose
- BullMQ job proactive cancellation on app deletion — add worker guard first; cancellation is P3 cleanup
- Client self-service app deletion — requires a separate auth model
- Soft delete / recycle bin — only justified if accidental deletion becomes a production problem
- Onboarding audit log — only if compliance requirements emerge

### Architecture Approach

The three features each touch a distinct layer of the existing architecture with minimal coupling between them. The race condition fix is a pure service-layer addition (new `git-lock.ts`, one-line change in `snapshot.worker.ts`). Onboarding protection is a route-handler change only (one session guard in `onboard.ts`, no plugin or middleware changes). App deletion introduces one new service file, one new repository function, one new admin route, and matching dashboard UI. All three changes respect Docora's established patterns: service orchestration in `src/services/`, admin session auth scoped inside Fastify plugin registrations, destructive UI actions gated by `ConfirmDialog` with `variant="danger"`.

**Major components involved:**

1. `src/services/git-lock.ts` (NEW) — path-scoped mutex wrapper; holds an `inflightOps` Map keyed by `{owner}/{name}`; first caller performs the git operation, subsequent callers await the same Promise result
2. `src/services/app-management.ts` (NEW) — `deleteAppWithCascade` orchestrator; loops over linked repositories calling existing `unwatchRepository` per link, then deletes the app record
3. `src/routes/apps/onboard.ts` (MODIFIED) — adds `request.session?.get("adminId")` guard before existing SSRF and validation logic; `publicAccess: true` retained so bearer-auth plugin is unaffected
4. `src/routes/admin/dashboard-api-apps.ts` (MODIFIED) — adds `DELETE /admin/api/apps/:appId` route, inheriting session auth from the enclosing `dashboardApiRoutes` plugin scope
5. Dashboard UI — `Apps.tsx` and `AppDetail.tsx` add delete button + `ConfirmDialog` using existing patterns; navigates back to Apps list on success

**Key patterns to maintain:**
- Session auth checks live inside scoped Fastify plugin registrations, never in global `onRequest` hooks covering `/api/*`
- Complex multi-step operations belong in `src/services/`, not in route handlers
- Orphan-safe deletion: `isRepositoryOrphan()` is always checked before `deleteLocalRepository`
- Lock granularity: per `{owner}/{name}` path, never a global worker mutex

### Critical Pitfalls

1. **Concurrent git operations corrupt shared clone directory** — two BullMQ jobs for different apps watching the same repo call `git remote set-url` and `git fetch` simultaneously, producing `index.lock` errors or wrong-token fetches. Prevention: acquire path-scoped mutex in `git-lock.ts` before `cloneOrPull`, wrap with `runExclusive()` so lock releases on both success and error.

2. **Orphan check race window during concurrent app deletions** — the unlink + `isRepositoryOrphan` + `deleteRepository` sequence is not atomic; two simultaneous admin deletes for apps sharing the same repo can both pass the orphan check and both attempt filesystem deletion. Prevention: wrap the entire sequence in a PostgreSQL transaction with `SELECT ... FOR UPDATE` on the `repositories` row.

3. **In-flight BullMQ job fails with FK violation after app deletion** — a job active at delete time calls `recordDelivery(app_id, ...)` after the app row is gone, triggering a FK constraint violation and an indefinite BullMQ retry loop. Prevention: add an early-exit guard at the top of `processSnapshotJob` that verifies the app-repository link exists; exit cleanly (not as an error) if missing.

4. **Bearer token bypasses admin session check on onboard endpoint** — if `publicAccess: true` is removed without adding an explicit session check, any existing app's bearer token satisfies `auth.ts` and reaches the handler unchallenged. Prevention: keep `publicAccess: true`, add `request.session?.get("adminId")` guard inside the handler. The two auth systems must remain independent.

5. **`app_repositories` FK lacks CASCADE — app delete raises PostgreSQL FK violation** — migration 002 created `fk_app_repositories_app` without `ON DELETE` behavior (defaults to RESTRICT). `DELETE FROM apps` before cleaning `app_repositories` raises a constraint error. Prevention: migration 008 drops and recreates the constraint with `ON DELETE CASCADE`, following the migration 006 pattern.

---

## Implications for Roadmap

Based on research, the suggested phase structure mirrors the build order proposed in ARCHITECTURE.md. All three backend phases are independent — no inter-phase dependencies — but Phase 4 (dashboard UI) requires Phase 3 (backend endpoint) to be reachable.

### Phase 1: Race Condition Fix

**Rationale:** Highest-severity correctness issue. Affects any production deployment where two or more apps watch the same private repository. Self-contained backend change with no DB migration and no UI work — lowest risk entry point. Must be addressed before issues compound under concurrent load.

**Delivers:** Serialized git operations per repository path; BullMQ concurrency across different repositories unchanged; existing `git.ts` untouched.

**Addresses:** Table stakes feature "no data corruption under concurrent git access"; differentiator "per-repo git lock, not global."

**Avoids:** Pitfall 1 (concurrent git corruption) and Pitfall 7 (lock not released on crash via `runExclusive()` auto-release).

**Needs research during planning:** No — `async-mutex` API and in-process Map pattern are fully documented and directly applicable. `pnpm add async-mutex@0.5.0` is the only setup step.

### Phase 2: Admin-Only Onboarding

**Rationale:** Single-file handler change with zero DB or UI impact. Ship early to close the security gap. Documentation update for `docs-site` is mandatory before deployment — existing automation scripts calling the open endpoint will break without notice.

**Delivers:** `POST /api/apps/onboard` requires active admin session; unauthenticated and bearer-token-only requests receive 401 with a descriptive error message; no URL change for any other route.

**Addresses:** Table stakes feature "protected onboarding endpoint."

**Avoids:** Pitfall 4 (breaking existing automation — `publicAccess: true` remains on bearer plugin, so the error comes from the handler with a useful message) and Pitfall 5 (bearer token bypass — in-handler session check, not URL-prefix routing).

**Needs research during planning:** No — Fastify handler-level session check pattern is established in `dashboard-actions.ts` and verified by direct code inspection.

### Phase 3: App Deletion Backend

**Rationale:** Backend must be complete before Phase 4 dashboard UI can call it. Most complex change — requires a DB migration, a new service file, a new repository function, and a new route. Benefits from landing after the simpler Phases 1 and 2 are stable.

**Delivers:** Migration 008 adding `ON DELETE CASCADE` to `app_repositories`; `deleteApp` function in `apps.ts`; `deleteAppWithCascade` service in `app-management.ts`; `DELETE /admin/api/apps/:appId` route; worker guard in `processSnapshotJob` for clean exit on deleted app.

**Addresses:** Table stakes feature "app deletion with cascade cleanup."

**Avoids:** Pitfalls 2 (orphan check race — requires transaction + `SELECT FOR UPDATE`), 3 (in-flight job FK violation — worker guard), 6 (scheduler re-queues deleted app — same worker guard covers this), and 8 (FK constraint blocks delete — migration 008 required).

**Needs research during planning:** Kysely transaction API with `SELECT ... FOR UPDATE` should be confirmed before implementation — verify `.forUpdate()` availability or raw SQL fallback for the orphan-check query.

### Phase 4: App Deletion Dashboard UI

**Rationale:** Depends on Phase 3 backend being deployed or locally reachable. Low risk — follows existing UI patterns exactly. Can be developed against a mocked API while Phase 3 is being reviewed.

**Delivers:** Delete button on Apps list and AppDetail pages; confirmation dialog showing app name and impact scope; navigation back to Apps list on success; TanStack Query cache invalidation.

**Addresses:** UX pitfall "delete app without showing what will be cascaded"; UX pitfall "no feedback during delete."

**Avoids:** UX pitfalls — dialog must describe which repositories will be affected and which clones will be preserved; button must be disabled with a spinner during the delete request.

**Needs research during planning:** No — `ConfirmDialog` with `variant="danger"` is already used in the project; TanStack Query mutation + invalidation pattern is established.

### Phase Ordering Rationale

- Phase 1 first because it is the only correctness defect and is fully self-contained. Correctness issues take priority over security when both are P1 and the security gap requires docs coordination.
- Phase 2 immediately after because it is a one-file security fix with no dependencies and minimal regression risk. Docs update must be coordinated with deployment.
- Phase 3 before Phase 4 because the backend endpoint must exist (or be mocked) before the UI can be tested end-to-end. The orphan-check transaction and worker guard are prerequisites for correctness.
- Phase 4 last because it is pure UI that has no value without Phase 3.
- Phases 1, 2, and 3 have no inter-dependencies and can be implemented in parallel by separate developers.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Kysely transaction API with `SELECT ... FOR UPDATE` for the orphan-check race window — confirm `.forUpdate()` syntax or need for raw SQL before implementation begins.

Phases with well-documented patterns (skip research-phase):
- **Phase 1:** `async-mutex` `runExclusive()` pattern is fully documented and directly applicable to the existing `cloneOrPull` call site.
- **Phase 2:** Handler-level session check is an established pattern in `dashboard-actions.ts` — one-file change.
- **Phase 4:** `ConfirmDialog`, TanStack Query mutation + invalidation, and navigate-on-success are all used in the existing dashboard codebase.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings based on direct codebase inspection and npm registry verification. `async-mutex@0.5.0` confirmed current. Liquibase migration pattern confirmed from migration 006. FK constraint state confirmed from migration 002. |
| Features | HIGH | All three features verified against live code. Feature boundaries, dependencies, and anti-features are grounded in actual implementation state, not speculation or competitor analysis. |
| Architecture | HIGH | All affected files read directly. Component boundaries, data flows, and integration points confirmed. Two implementation approaches documented for onboarding auth (URL relocation vs. in-handler guard) with explicit recommendation. |
| Pitfalls | HIGH | Eight specific pitfalls identified with code-level root cause analysis. FK constraint state confirmed from migration files. BullMQ concurrency model confirmed from official docs. PostgreSQL MVCC race condition is well-documented. |

**Overall confidence:** HIGH

### Gaps to Address

- **Kysely `SELECT ... FOR UPDATE` syntax:** The orphan-check race is identified and the fix is specified (wrap in a transaction with a row lock). The exact Kysely API for acquiring a `FOR UPDATE` lock (`.forUpdate()` on the select chain, or a raw SQL fragment) should be confirmed before Phase 3 implementation. This is a narrow API question, not a design uncertainty.

- **BullMQ job drain cost at scale:** Filtering `getJobs(['waiting','delayed'])` by `app_id` requires a full queue scan because BullMQ does not index by payload. At current Docora scale this is acceptable. If the queue grows beyond a few hundred jobs, the scan time will be noticeable. The worker guard (early exit when the app-repo link is missing) is the primary correctness mitigation; job drain is optional cleanup to reduce noise in the failed-jobs list.

- **`ADMIN_SESSION_SECRET` startup validation:** PITFALLS.md flags that if this environment variable is missing, admin auth routes return 503 and onboarding becomes effectively unprotected. A fast-fail check at server startup should be added alongside the Phase 2 onboard auth change to make misconfiguration immediately visible.

- **Docs site update scope for Phase 2:** The existing `docs-site` documentation describes the onboard endpoint as self-service. The specific pages that reference this endpoint must be identified and updated before Phase 2 is deployed. Failure to do so will result in developer confusion and broken automation scripts without an obvious root cause.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/services/git.ts` — `cloneOrPull` implementation, shared filesystem path derivation
- `src/workers/snapshot.worker.ts` — BullMQ job flow, concurrency model, `cloneOrPull` call site
- `src/workers/snapshot.scheduler.ts` — scheduler query and job enqueue logic
- `src/routes/apps/onboard.ts` — `publicAccess: true` declaration
- `src/plugins/auth.ts` — bearer auth hook and `publicAccess` bypass logic
- `src/routes/admin/dashboard-api.ts`, `dashboard-actions.ts` — session auth scoping pattern
- `src/services/repository-management.ts` — `unwatchRepository`, `isRepositoryOrphan`, `deleteRepository`, `deleteLocalRepository`
- `src/repositories/apps.ts`, `repositories.ts`, `deliveries.ts` — Kysely data access layer
- `deploy/liquibase/changelog/002-create-repositories-table.yml` — FK without cascade confirmed
- `deploy/liquibase/changelog/006-app-delivered-files.yml` — `ON DELETE CASCADE` pattern confirmed
- `dashboard/src/pages/AppDetail.tsx`, `Apps.tsx` — `ConfirmDialog` usage and UI patterns
- `packages/shared-types/src/dashboard.ts` — existing type contracts

### Secondary (HIGH confidence — official documentation)
- npm registry `async-mutex@0.5.0` — version, dependencies, TypeScript support verified
- Fastify encapsulation and hooks: https://fastify.dev/docs/latest/Reference/Encapsulation/
- BullMQ concurrency: https://docs.bullmq.io/guide/workers/concurrency
- BullMQ cancelling jobs: https://docs.bullmq.io/guide/workers/cancelling-jobs
- BullMQ stalled jobs: https://docs.bullmq.io/guide/workers/stalled-jobs
- Liquibase `addForeignKeyConstraint` + `dropForeignKeyConstraint` YAML syntax (official docs)
- Redis distributed locks: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/

### Secondary (MEDIUM confidence — community sources)
- Git concurrent access safety (index.lock behavior): github.com/SmartBear/git-en-boite/issues/211
- PostgreSQL MVCC race conditions and FOR UPDATE: bufisa.com/2025/07/17/handling-race-conditions-in-postgresql-mvcc/
- Soft delete analysis (hard delete recommendation): brandur.org/soft-deletion
- Argo CD cascade deletion UI pattern: argo-cd.readthedocs.io
- Managing API breaking changes: theneo.io/blog/managing-api-changes-strategies

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
