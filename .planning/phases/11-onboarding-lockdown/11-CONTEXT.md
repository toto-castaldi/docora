# Phase 11: Onboarding Lockdown - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the security gap of open app onboarding. Move the `POST /api/apps/onboard` endpoint behind admin session authentication so only authenticated admins can register new apps. Update documentation and Swagger spec to reflect the change.

</domain>

<decisions>
## Implementation Decisions

### Auth mechanism
- Move endpoint from `/api/apps/onboard` to `/admin/api/apps/onboard` — inherits admin session auth automatically
- Remove the old `/api/apps/onboard` route entirely (no redirect, no 410 — just gone)
- Admin session only — bearer tokens have zero access to onboarding
- Verify the admin dashboard onboarding UI still works with the new route

### Error responses
- Descriptive 401 message: "Admin authentication required. Use the admin dashboard to onboard new apps."
- Same 401 for all unauthenticated cases — don't differentiate between no auth and bearer-token-only
- Browser requests redirect to `/admin/login` (consistent with existing admin-auth behavior)
- API requests get JSON 401
- Success response (201) stays unchanged — same body with app_id, token, etc.

### Docs site update
- Update Hugo docs site: state clearly that onboarding requires admin authentication
- Remove any self-service onboarding language — brief, factual messaging
- Do NOT mention the old endpoint — docs only show current state
- Update Swagger/OpenAPI spec to reflect the new endpoint location under `/admin/api`

### Migration path
- Hard cutover — no transition period, no env toggle, no deprecation warnings
- Commit as `feat:` (not breaking) — the public endpoint was a security gap, not a supported contract
- Update existing tests to use the new admin endpoint with proper session auth

### Claude's Discretion
- Route file organization (new file vs extending existing admin routes)
- Test structure and helper patterns for admin session auth in tests
- Exact Swagger tag/grouping for the moved endpoint

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key behavior is: admin session cookie = access, everything else = 401.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-onboarding-lockdown*
*Context gathered: 2026-02-24*
