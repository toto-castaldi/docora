---
phase: 11-onboarding-lockdown
plan: 01
subsystem: auth
tags: [fastify, session-auth, admin, onboarding, security]

# Dependency graph
requires:
  - phase: none
    provides: standalone - uses existing admin-auth infrastructure
provides:
  - Admin-gated onboard route at /admin/api/apps/onboard with custom 401 message
  - Session-based authentication enforcement for app onboarding
  - Integration tests for admin onboard auth layer
affects: [phase-12-app-deletion, phase-13-app-deletion-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [encapsulated-onRequest-hook-for-custom-401, PUBLIC_ADMIN_PATHS-bypass-for-route-level-auth]

key-files:
  created:
    - src/routes/admin/onboard.ts
    - tests/routes/admin/onboard.test.ts
  modified:
    - src/plugins/admin-auth.ts
    - src/routes/admin/index.ts
    - src/routes/index.ts
    - src/plugins/swagger.ts

key-decisions:
  - "Added /admin/api/apps/onboard to PUBLIC_ADMIN_PATHS so route plugin handles auth with custom 401 message instead of generic admin-auth response"
  - "Old /api/apps/onboard returns 401 (bearer auth intercept) not 404, because auth plugin runs before route matching for non-public routes"

patterns-established:
  - "Route-level auth override: Add path to PUBLIC_ADMIN_PATHS, then use encapsulated onRequest hook for custom error messages"

requirements-completed: [SEC-01]

# Metrics
duration: 7min
completed: 2026-02-24
---

# Phase 11 Plan 01: Onboarding Lockdown Summary

**Relocated app onboarding from public /api/apps/onboard to admin-gated /admin/api/apps/onboard with session auth and custom 401 error message**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-24T22:38:49Z
- **Completed:** 2026-02-24T22:46:03Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Moved onboard route from public API tree to admin route tree with session-based authentication
- Custom descriptive 401 message: "Admin authentication required. Use the admin dashboard to onboard new apps."
- Deleted old public route files and cleaned up route registration
- Added 4 integration tests verifying auth enforcement (unauthenticated 401, API path detection, bearer token irrelevance, old endpoint inaccessible)

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate onboard route to admin tree with session auth** - `21182ba` (feat)
2. **Task 2: Write integration tests for admin onboard auth enforcement** - `ec60145` (test)

## Files Created/Modified
- `src/routes/admin/onboard.ts` - New admin-only onboard route with encapsulated session check
- `tests/routes/admin/onboard.test.ts` - Integration tests for auth enforcement (4 test cases)
- `src/plugins/admin-auth.ts` - Added `/admin/api/apps/onboard` to PUBLIC_ADMIN_PATHS
- `src/routes/admin/index.ts` - Register adminOnboardRoute after authRoutes
- `src/routes/index.ts` - Removed appsRoutes import (no remaining public app routes)
- `src/plugins/swagger.ts` - Updated bearerAuth description to reference admin onboarding
- `src/routes/apps/onboard.ts` - Deleted (old public route)
- `src/routes/apps/index.ts` - Deleted (empty after onboard removal)

## Decisions Made
- Added `/admin/api/apps/onboard` to `PUBLIC_ADMIN_PATHS` so the generic admin-auth hook skips it, allowing the route plugin's own `onRequest` hook to return the custom 401 message (per research recommendation)
- The old `/api/apps/onboard` endpoint returns 401 instead of 404 because the bearer auth plugin intercepts unauthenticated requests before Fastify checks route existence - this is correct security behavior (no information leakage about route existence)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Browser redirect test adjusted for API URL detection**
- **Found during:** Task 2
- **Issue:** Plan's must_have stated "Browser request to /admin/api/apps/onboard without session redirects to /admin/login" but `isApiRequest()` checks `request.url.includes("/admin/api/")`, meaning ANY request to an `/admin/api/` URL is treated as an API request regardless of accept header
- **Fix:** Updated test to verify that API URL detection takes precedence over accept header (returns 401 JSON, not 302 redirect). This is consistent with the existing `admin-auth.ts` pattern and is correct behavior since POST to an API URL from a browser is not a navigation request
- **Files modified:** `tests/routes/admin/onboard.test.ts`
- **Verification:** All 4 tests pass

**2. [Rule 1 - Bug] Old endpoint returns 401 not 404**
- **Found during:** Task 2
- **Issue:** Plan expected old `/api/apps/onboard` to return 404, but bearer auth plugin in `auth.ts` intercepts all unauthenticated non-admin, non-public requests with 401 before Fastify can return 404
- **Fix:** Updated test to assert 401 with "Missing or invalid Authorization header" message, confirming the old public route (with `publicAccess: true`) is truly gone
- **Files modified:** `tests/routes/admin/onboard.test.ts`
- **Verification:** Test passes, confirming the security gap is closed

---

**Total deviations:** 2 auto-fixed (2 bugs in test expectations)
**Impact on plan:** Both are test expectation adjustments reflecting actual codebase behavior. The security outcomes are correct: old endpoint is inaccessible, new endpoint requires admin session.

## Issues Encountered
None - implementation was straightforward following established codebase patterns.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-01 requirement satisfied: only authenticated admins can onboard apps
- Phase 11 Plan 02 (documentation updates) already committed in a prior session
- Ready for Phase 12 (App Deletion Backend) which is independent

## Self-Check: PASSED

- FOUND: src/routes/admin/onboard.ts
- FOUND: tests/routes/admin/onboard.test.ts
- CONFIRMED DELETED: src/routes/apps/onboard.ts
- CONFIRMED DELETED: src/routes/apps/index.ts
- FOUND: 11-01-SUMMARY.md
- FOUND: commit 21182ba
- FOUND: commit ec60145

---
*Phase: 11-onboarding-lockdown*
*Completed: 2026-02-24*
