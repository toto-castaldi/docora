---
phase: 11-onboarding-lockdown
verified: 2026-02-24T23:50:00Z
status: human_needed
score: 3/4 success criteria verified automatically
human_verification:
  - test: "Authenticated admin can onboard a new app successfully"
    expected: "POST /admin/api/apps/onboard with a valid admin session cookie returns 201 with app_id, token, and created_at fields"
    why_human: "The integration tests only cover the unauthenticated (401) path. The authenticated success path requires a live database connection and a valid admin session. The route implementation is substantive (calls createApp, returns 201), but the end-to-end happy path cannot be confirmed without running against a real DB."
---

# Phase 11: Onboarding Lockdown Verification Report

**Phase Goal:** Only authenticated admins can register new apps; the security gap of open onboarding is closed
**Verified:** 2026-02-24T23:50:00Z
**Status:** human_needed (3/4 success criteria verified automatically; 1 requires human)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unauthenticated POST /api/apps/onboard receives 401 with descriptive error message explaining admin auth is required | VERIFIED | Test passes: `response.statusCode === 401`, `error === "Admin authentication required. Use the admin dashboard to onboard new apps."` |
| 2 | Bearer-token-only POST /api/apps/onboard receives 401 (bearer auth alone is insufficient) | VERIFIED | Test passes: request with `Authorization: Bearer some-valid-looking-token` returns 401 with admin-auth message, not bearer-auth message — confirms the route's own `onRequest` hook fires before bearer-auth layer |
| 3 | Authenticated admin can still onboard new apps successfully through the existing endpoint | HUMAN_NEEDED | Route implementation is substantive (calls `createApp`, returns 201 with `OnboardResponseSchema`) but no automated test covers the success path — requires live DB |
| 4 | The docs site accurately reflects that onboarding requires admin authentication (no stale self-service language) | VERIFIED | `docs-site/content/_index.md` line 14: "An admin registers your app through the Docora admin dashboard." No self-service or `/api/apps/onboard` language in any source markdown file. `docs-site/public/` contains stale content but is gitignored (generated build artifact). |

**Automated Score:** 3/4 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/routes/admin/onboard.ts` | Admin-only onboard route with custom 401 message | VERIFIED | 57 lines, contains `onRequest` hook, checks `request.session?.get("adminId")`, returns `"Admin authentication required. Use the admin dashboard to onboard new apps."` on 401, calls `createApp` on success |
| `tests/routes/admin/onboard.test.ts` | Auth enforcement tests for onboard endpoint | VERIFIED | 97 lines (>30 min), 4 test cases, all passing |
| `src/plugins/admin-auth.ts` | PUBLIC_ADMIN_PATHS includes /admin/api/apps/onboard | VERIFIED | Line 69: `"/admin/api/apps/onboard"` in `PUBLIC_ADMIN_PATHS` array — route plugin handles its own auth with custom 401 |
| `src/routes/admin/index.ts` | Registers adminOnboardRoute | VERIFIED | Line 13: `await server.register(adminOnboardRoute)` — registered after authRoutes, before dashboardApiRoutes |
| `src/routes/index.ts` | No longer references appsRoutes | VERIFIED | Only registers `healthRoutes`, `versionRoutes`, `repositoriesRoutes` — no appsRoutes import |
| `src/plugins/swagger.ts` | bearerAuth description updated | VERIFIED | Line 25: `"Enter the app token received during admin onboarding"` — old self-service reference removed |
| `docs-site/content/_index.md` | Admin dashboard language for onboarding | VERIFIED | Step 1 updated to admin dashboard framing |
| `bruno/apps/onboard.bru` | Targets /admin/api/apps/onboard | VERIFIED | Line 8: `url: {{baseUrl}}/admin/api/apps/onboard`, session cookie header added |
| `src/routes/apps/onboard.ts` | Deleted (old public route) | VERIFIED | `src/routes/apps/` directory does not exist |
| `src/routes/apps/index.ts` | Deleted | VERIFIED | Directory does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/routes/admin/index.ts` | `src/routes/admin/onboard.ts` | `server.register(adminOnboardRoute)` | WIRED | Import on line 3, registration on line 13 |
| `src/plugins/admin-auth.ts` | `/admin/api/apps/onboard` | `PUBLIC_ADMIN_PATHS` bypass | WIRED | Path listed in PUBLIC_ADMIN_PATHS (line 69); generic admin-auth hook skips it, route plugin handles auth with custom message |
| `src/routes/admin/onboard.ts` | `src/repositories/apps.ts` | `createApp(body)` | WIRED | Import on line 8, called on line 53 with body — result returned as 201 |
| `docs-site/content/_index.md` | admin dashboard language | text update | WIRED | Line 14 explicitly names admin dashboard for onboarding |
| `bruno/apps/onboard.bru` | `/admin/api/apps/onboard` | URL field | WIRED | Line 8 targets new endpoint; session cookie header on line 17 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-01 | 11-01-PLAN.md | Admin can onboard new apps only when authenticated via admin session; unauthenticated requests receive 401 with descriptive error | SATISFIED | `adminOnboardRoute` enforces session check via encapsulated `onRequest` hook; 4 tests confirm 401 for all unauthenticated variants; old public route deleted |
| SEC-02 | 11-02-PLAN.md | API documentation reflects that onboarding requires admin authentication | SATISFIED | Hugo docs source updated, Bruno collection updated, CLAUDE.md updated; no stale self-service language in any tracked source file |

Both requirements are marked complete in `REQUIREMENTS.md` (lines 16-17) and the traceability table (lines 58-59).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODO/FIXME/placeholder comments, no empty return values, no stub handlers found in the modified files.

### Human Verification Required

#### 1. Authenticated Admin Onboarding (201 Happy Path)

**Test:** Log into the admin dashboard at `/admin/login` with valid credentials. Copy the session cookie. Use Bruno or curl with the session cookie to POST to `/admin/api/apps/onboard` with a valid request body (`base_url`, `app_name`, `email`, `client_auth_key`).

**Expected:** Response status 201 with JSON body containing `app_id` (string), `token` (string starting with `docora_`), and `created_at` (ISO timestamp).

**Why human:** The test file covers only the rejection paths (3 unauthenticated 401 variants, 1 old-route inaccessibility test). The success path requires a live database — the `createApp` repository function is not mocked in any test. The route implementation is substantive (not a stub), but end-to-end confirmation of a real write + 201 response needs a running environment.

### Gaps Summary

No blocking gaps were found. All security-critical behaviors are implemented and tested:

- The onboarding security gap is closed: the old public `POST /api/apps/onboard` route is deleted, bearer auth blocks unauthenticated access to it (returns 401, not 404, preventing route existence disclosure).
- The new `POST /admin/api/apps/onboard` enforces session authentication with a descriptive 401 error message for all unauthenticated callers.
- Bearer-token-only requests are correctly rejected by the route's own `onRequest` hook (not the bearer auth plugin), confirming bearer auth alone is insufficient for admin operations.
- All documentation sources (Hugo site, Bruno collection, CLAUDE.md) reflect admin-only onboarding with no stale self-service language.

The only open item is human confirmation that the full happy path (authenticated admin creating an app) returns 201 with correct fields, which requires a live database.

---

_Verified: 2026-02-24T23:50:00Z_
_Verifier: Claude (gsd-verifier)_
