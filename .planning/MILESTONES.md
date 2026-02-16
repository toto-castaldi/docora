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

