# Docora Admin Dashboard

## What This Is

An admin monitoring dashboard for Docora, the headless GitHub repository monitoring service. Provides proactive system health monitoring with full visibility into apps, repositories, notifications, and job queues — plus one-click retry and recovery operations, GitHub token rotation, proactive sync failure notifications, app lifecycle management, in-dashboard app onboarding, developer-facing documentation, and GSD-native milestone versioning — so administrators can see and fix failures before clients report them.

## Core Value

**See failures before clients report them, and fix them with one click.**

## Requirements

### Validated

<!-- Existing Docora capabilities -->

- ✓ App registration with bearer token authentication — existing
- ✓ Repository registration and linking to apps — existing
- ✓ GitHub repository monitoring (clone/pull) — existing
- ✓ File change detection via SHA-256 hashing — existing
- ✓ Push notifications to client apps (create/update/delete events) — existing
- ✓ Chunked delivery for large binary files — existing
- ✓ Per-app delivery tracking for idempotency — existing
- ✓ Circuit breaker for Git operation failures — existing
- ✓ BullMQ job queue for async snapshot processing — existing
- ✓ Multi-worker support — existing

<!-- v1.0 Dashboard features -->

- ✓ DASH-01: Admin can log in with username/password — v1.0
- ✓ DASH-02: Admin can view failed notifications with error details — v1.0
- ✓ DASH-03: Admin can retry failed notifications — v1.0
- ✓ DASH-04: Admin can view job queue status (pending count, running count) — v1.0
- ✓ DASH-05: Admin can view list of registered apps — v1.0
- ✓ DASH-06: Admin can view repositories monitored by each app — v1.0
- ✓ DASH-07: Admin can view history of sent updates — v1.0 (failed notifications only, full delivery history deferred)
- ✓ DASH-08: Dashboard is protected behind authentication — v1.0

<!-- v1.1 Polish & Resilience -->

- ✓ DCLEAN-01: Admin repositories page removed from navigation — v1.1
- ✓ DCLEAN-02: Backend admin API endpoints for global repo listing removed — v1.1
- ✓ TOKEN-01: App can update GitHub token via PATCH without losing history — v1.1
- ✓ TOKEN-02: Token update validates against GitHub API before persisting — v1.1
- ✓ TOKEN-03: Token update resets error state for fresh start — v1.1
- ✓ NOTIFY-01: App receives sync_failed webhook when circuit breaker opens — v1.1
- ✓ NOTIFY-02: Sync failure notification includes error details and circuit breaker status — v1.1
- ✓ NOTIFY-03: Sync failure notification uses same HMAC auth as file notifications — v1.1
- ✓ DOCS-01: Homepage explains Docora value proposition — v1.1
- ✓ DOCS-02: API docs cover onboard endpoint with schemas — v1.1
- ✓ DOCS-03: API docs cover repository endpoints (POST, DELETE, PATCH) — v1.1
- ✓ DOCS-04: Webhook docs cover all 4 notification types — v1.1
- ✓ DOCS-05: Site has clear navigation between sections — v1.1

<!-- v1.2 Hardening & App Management -->

- ✓ RACE-01: Git operations serialized via per-repo distributed mutex — v1.2
- ✓ SEC-01: Onboarding endpoint protected by admin session auth — v1.2
- ✓ SEC-02: Documentation reflects admin-only onboarding — v1.2
- ✓ DEL-01: App cascade deletion with shared-resource preservation — v1.2
- ✓ DEL-02: In-flight jobs exit cleanly on app deletion — v1.2
- ✓ DEL-03: Dashboard deletion UI with confirmation dialogs — v1.2

<!-- v1.3 Versioning System -->

- ✓ CLEAN-01..04: Commit tooling removed (commitlint, czg, cz-git, husky hooks, CI release job) — v1.3
- ✓ VER-01..06: Version derived from STATE.md via codegen script, flat /version endpoint — v1.3
- ✓ CI-01..03: Push-to-deploy CI/CD with STATE.md-derived Docker image tagging — v1.3
- ✓ ONBD-01..04: In-dashboard onboarding with credentials modal and copy-to-clipboard — v1.3
- ✓ DASH-09: Dashboard footer shows current version — v1.3

### Active

(No active requirements — start next milestone with `/gsd:new-milestone`)

### Out of Scope

- Client-facing dashboard — admin-only for now
- OAuth/SSO authentication — simple username/password is sufficient
- Real-time WebSocket updates — polling works well for admin use case
- Mobile app — web dashboard only
- Multi-admin support — single admin account for now
- Full notification delivery history/audit log — requires new table, high cost
- Email/Slack alerting — proactive notification deferred
- Multi-user admin with RBAC — overkill for single-developer use case
- Sync recovery notification — when circuit closes again, nice to have
- Client self-service app deletion — requires separate auth model
- Soft delete / recycle bin for app recovery — only if accidental deletion becomes a problem
- Client self-service onboarding — admin-only by design
- Git tags for releases — GSD-native versioning uses STATE.md
- Patch version numbers — major.minor only per versioning spec

## Context

**Current state:** v1.3 shipped. All 4 milestones complete.

**Codebase:**
- ~60,900 LOC TypeScript
- Tech stack: Fastify + TypeScript + PostgreSQL + Redis/BullMQ + React + TanStack Query
- Monorepo: `dashboard/` (React frontend), `packages/shared-types/` (shared TypeScript types)
- Admin auth: session-based with Redis store, isolated from client bearer token auth
- Docs site: Hugo-based in `docs-site/` with multi-page layout (homepage, API, webhooks)
- Docker: multi-stage build includes dashboard assets and docs site
- Distributed locking: Redlock-based per-repo mutex for concurrent git safety
- Version: codegen from STATE.md via extract-version.cjs → version.ts → Docker image tags

**Known tech debt:**
- DASH-07 partial implementation (failed notifications only, not full delivery history)
- shutdownRepoLock() and closeDeleteQueue() exported but not wired into graceful shutdown
- DeleteAppResult type duplicated in service and shared-types
- 8 human-verification items (visual UI, live CI run, Docker build)
- Test coverage on existing client API routes could be improved

## Constraints

- **Tech stack**: React for frontend (developer familiarity)
- **Architecture**: Monorepo — dashboard lives inside Docora repo
- **Auth**: Simple username/password, not OAuth
- **Deployment**: Dashboard served alongside API via Fastify static file serving
- **Versioning**: STATE.md is single source of truth, codegen at build time

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React frontend | Developer knows React | ✓ Good — v1.0 |
| Monorepo structure | Simpler deployment, shared types | ✓ Good — v1.0 |
| Simple admin auth | Only one admin needed, no complexity | ✓ Good — v1.0 |
| Polling over WebSocket | Simpler for v1, can add later | ✓ Good — v1.0 |
| 5-phase roadmap | Standard depth, covers all requirements | ✓ Good — v1.0 |
| Custom IoRedisSessionStore | connect-redis requires node-redis, not ioredis | ✓ Good — v1.0 |
| Redis hashes for bulk progress | TTL auto-cleanup, no DB migrations needed | ✓ Good — v1.0 |
| Native HTML dialog for confirmations | Zero-dependency, replaces window.confirm | ✓ Good — v1.0 |
| Server-side pagination with sort whitelists | Prevents SQL injection, consistent API | ✓ Good — v1.0 |
| Single ErrorBoundary with route-based reset | Simple, resets on navigation | ✓ Good — v1.0 |
| Remove global repos page | Info already in AppDetail, less noise | ✓ Good — v1.1 |
| Fire-and-forget sync_failed notifications | Never block worker or BullMQ retry | ✓ Good — v1.1 |
| Reset status to pending_snapshot on token update | Triggers fresh scan with new token | ✓ Good — v1.1 |
| Hugo multi-page docs with menu config | Clean separation of homepage, API, webhooks | ✓ Good — v1.1 |
| Per-app GitHub token in app_repositories | Different apps can use different auth | ✓ Good — race condition fixed by Redlock in v1.2 |
| Redlock with dedicated Redis connection | Avoid blocking BullMQ queue operations | ✓ Good — v1.2 |
| Minimal lock scope (git ops only) | Reduce contention and TTL risk | ✓ Good — v1.2 |
| Onboard route in admin tree | Session auth enforcement, custom 401 | ✓ Good — v1.2 |
| Transaction cascade delete (FK-safe order) | Atomic cleanup, no orphaned records | ✓ Good — v1.2 |
| 200 with summary body for delete | Dashboard feedback on deletion scope | ✓ Good — v1.2 |
| useDeleteApp hook with optional AppDetail | Skip fetch when counts already available | ✓ Good — v1.2 |
| STATE.md as version source of truth | No commit analysis, single codegen entry point | ✓ Good — v1.3 |
| CommonJS extract script (.cjs) | Runs with plain node, no ESM config dependency | ✓ Good — v1.3 |
| Vite define for build-time version | No runtime env resolution, baked at compile time | ✓ Good — v1.3 |
| Reusable FormField/PasswordField components | SRP, 150-line limit, ready for future forms | ✓ Good — v1.3 |
| CopyField as separate component | DRY, reusable clipboard pattern | ✓ Good — v1.3 |
| Docker build-args for CI metadata | Version baked into image at build time | ✓ Good — v1.3 |

---
*Last updated: 2026-02-26 after v1.3 milestone*
