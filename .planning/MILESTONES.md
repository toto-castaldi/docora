# Milestones

## v1.0 Docora Admin Dashboard (Shipped: 2026-02-13)

**Phases:** 1-5 (25 plans)
**Timeline:** 38 days (2026-01-06 → 2026-02-13)
**Execution time:** 1.52 hours (~3.5 min avg per plan)
**Codebase:** ~7,094 LOC (4,631 frontend + 2,463 backend)

**Delivered:** Admin monitoring dashboard enabling proactive system health visibility and one-click failure recovery for Docora's GitHub repository monitoring service.

**Key accomplishments:**
- Session-based admin authentication with Redis sessions, isolated from client API bearer auth
- Full system visibility: Overview, apps, repositories, notifications, and job queue pages with polling
- Retry and recovery operations: single retry, bulk retry with progress tracking, force re-sync
- Enhanced data navigation: server-side pagination, search, filtering, sorting across all tables
- Production hardening: CSP headers, rate limiting, error boundaries, Docker multi-stage build

**Audit:** PASSED — 8/8 requirements, 5/5 phases, 10/10 integration, 8/8 E2E flows

**Tech debt carried forward:**
- DASH-07 partial: shows failed notifications only, full delivery history deferred (requires new table)
- 6 runtime behaviors need human verification (CSP, rate limiting, error boundary, Docker)

See: `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`

---


## v1.1 Polish & Resilience (Shipped: 2026-02-15)

**Phases:** 6-9 (6 plans)
**Timeline:** 2 days (2026-02-14 → 2026-02-15)
**Execution time:** 0.25 hours (~2.6 min avg per plan)
**Files changed:** 25 (1,283 insertions, 1,008 deletions)

**Delivered:** Dashboard UX cleanup, GitHub token rotation API, proactive sync failure notifications, and multi-page documentation site for Docora integrators.

**Key accomplishments:**
- Removed redundant global repositories page — repo info now per-app only in AppDetail
- Added PATCH /api/repositories/:id/token for GitHub token rotation with API validation and error state reset
- Created sync_failed webhook notification (HMAC-signed) when circuit breaker opens
- Revamped docs-site into multi-page Hugo structure: homepage, API reference, webhook reference
- Documented all 4 API endpoints and all 4 webhook notification types

**Tech debt carried forward:**
- DASH-07 partial: shows failed notifications only, full delivery history deferred
- Race condition on shared git clone with per-app tokens (tracked in todos)
- 6 runtime behaviors still need human verification (CSP, rate limiting, error boundary, Docker)

See: `.planning/milestones/v1.1-ROADMAP.md`, `.planning/milestones/v1.1-REQUIREMENTS.md`

---


## v1.2 Hardening & App Management (Shipped: 2026-02-25)

**Phases:** 10-13 (7 plans)
**Timeline:** 2 days (2026-02-24 → 2026-02-25)
**Execution time:** 0.52 hours (~4.5 min avg per plan)
**Files changed:** 67 (6,377 insertions, 125 deletions)

**Delivered:** Race condition fix for concurrent git operations, onboarding lockdown behind admin auth, and full app deletion lifecycle with cascade cleanup and dashboard UI.

**Key accomplishments:**
- Per-repo distributed mutex via Redlock serializes concurrent git operations without global locking
- Onboard route relocated to admin tree with session auth enforcement and custom 401 messages
- Documentation (Hugo site, Bruno, CLAUDE.md) updated for admin-only onboarding
- Cascade app deletion preserving shared repo clones used by other apps
- Worker app-existence guard prevents FK violations and retry loops for deleted apps
- Dashboard deletion UI with confirmation dialogs showing snapshot/delivery impact counts

**Audit:** PASSED — 6/6 requirements, 4/4 phases, 8/8 integration, 4/4 E2E flows

**Tech debt carried forward:**
- shutdownRepoLock() and closeDeleteQueue() exported but not called in graceful shutdown (LOW)
- DeleteAppResult type duplicated in service and shared-types (LOW)
- DASH-07 partial: failed notifications only, full delivery history still deferred

See: `.planning/milestones/v1.2-ROADMAP.md`, `.planning/milestones/v1.2-REQUIREMENTS.md`

---


## v1.3 Versioning System (Shipped: 2026-02-26)

**Phases:** 14-17 (7 plans)
**Timeline:** 2 days (2026-02-25 → 2026-02-26)
**Execution time:** 0.16 hours (~2.0 min avg per plan)
**Files changed:** 121 (11,280 insertions, 2,022 deletions)

**Delivered:** GSD-native milestone versioning with STATE.md as single source of truth, simplified push-to-deploy CI/CD, dashboard version display, and admin onboarding UI with credential modal.

**Key accomplishments:**
- Removed commit-based versioning toolchain (commitlint, czg, cz-git, husky hooks)
- Built codegen script deriving version from STATE.md as single source of truth
- Dashboard sidebar displays version with build-time Vite injection
- CI/CD pipeline rebuilt: push-to-deploy with STATE.md-derived Docker image tagging
- Admin onboard form with validated fields and reusable FormField/PasswordField components
- Credentials modal with copy-to-clipboard and one-time token warning

**Audit:** TECH DEBT — 18/18 requirements, 4/4 phases, 13/14 integration, 5/5 E2E flows

**Tech debt carried forward:**
- DASH-07 partial: failed notifications only, full delivery history still deferred
- shutdownRepoLock() and closeDeleteQueue() not wired into graceful shutdown
- DeleteAppResult type duplicated in service and shared-types
- 8 human-verification items (visual UI testing, live CI run)

See: `.planning/milestones/v1.3-ROADMAP.md`, `.planning/milestones/v1.3-REQUIREMENTS.md`

---

