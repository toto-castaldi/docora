# Phase 1: Foundation & Authentication - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo structure (pnpm workspace with dashboard/ and packages/shared-types/) and admin session-based authentication. Admin can log in with username/password, stay logged in across refreshes, log out, and unauthorized users are blocked from /admin/* routes. Auth is isolated from client Bearer token auth.

</domain>

<decisions>
## Implementation Decisions

### Login Experience
- Login form visual design: Claude's discretion
- Error messages: Generic "Invalid credentials" — don't reveal if username exists
- No "Remember me" checkbox — single session behavior for all logins
- Post-login redirect: Claude's discretion (dashboard home or return to requested page)

### Session Behavior
- Session duration: 1 hour
- Sliding expiration: Yes — each action resets the 1-hour timer
- Session expiry UX: Toast notification "Session expired", then redirect to login
- Multiple sessions: Allowed — same admin can be logged in from multiple browsers/devices

### Admin Credentials Setup
- Initial admin creation: Environment variables (ADMIN_USERNAME, ADMIN_PASSWORD)
- Password storage: Plaintext in env var — app hashes for comparison, relies on env security
- Single admin only — no multi-admin support needed
- Missing credentials behavior: App starts but /admin/* routes return 503 with setup instructions

### Route Protection
- Unauthenticated access to /admin/*: Redirect to /admin/login with return URL
- No message on login page after redirect — user understands
- API calls to /admin/* endpoints: JSON 401 response (not redirect)
- Brute-force protection: Deferred to Phase 5 (Production Hardening)

### Claude's Discretion
- Login form visual design (minimal centered, branded, etc.)
- Post-login redirect behavior
- Loading states and transitions
- Exact toast notification styling

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- Rate limiting / brute-force protection on login — Phase 5
- Multiple admin users — not needed

</deferred>

---

*Phase: 01-foundation-authentication*
*Context gathered: 2026-01-29*
