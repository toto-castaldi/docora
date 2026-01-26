# Roadmap: Docora Admin Dashboard

## Overview

This roadmap delivers an admin monitoring dashboard for Docora, transforming reactive failure discovery (waiting for client complaints) into proactive system health monitoring. The journey progresses from authentication foundation through data visibility to operational controls, enabling administrators to see and fix notification failures before clients report them.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Authentication** - Monorepo structure and admin login
- [ ] **Phase 2: Dashboard Integration & Core Display** - Serve dashboard and view system state
- [ ] **Phase 3: Retry Operations & Actions** - Fix failures with operational controls
- [ ] **Phase 4: Enhanced Visibility** - Search, filtering, and circuit breaker status
- [ ] **Phase 5: Production Hardening** - Security, error handling, and deployment

## Phase Details

### Phase 1: Foundation & Authentication
**Goal**: Admin can securely log in to the dashboard using session-based authentication isolated from client API
**Depends on**: Nothing (first phase)
**Requirements**: DASH-01, DASH-08
**Success Criteria** (what must be TRUE):
  1. Admin can log in with username/password and receive session cookie
  2. Admin session persists across browser refreshes without re-login
  3. Admin can log out and session is invalidated
  4. Unauthenticated requests to /admin/* routes redirect to login
  5. pnpm workspace monorepo structure exists with dashboard/ and packages/shared-types/
  6. Admin auth is isolated from client Bearer token auth (separate plugin)
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 2: Dashboard Integration & Core Display
**Goal**: Admin can view comprehensive system state including apps, repositories, failed notifications, and job queue status
**Depends on**: Phase 1
**Requirements**: DASH-02, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. Dashboard UI is served from /admin and accessible after login
  2. Admin can view list of registered apps with their callback URLs
  3. Admin can view repositories monitored by each app
  4. Admin can view failed notifications with error details, timestamp, and retry count
  5. Admin can view job queue status showing pending and running job counts
  6. Admin can view history of sent updates (create/update/delete events)
  7. Circuit breaker status is visible for repositories with open circuits
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 3: Retry Operations & Actions
**Goal**: Admin can recover from notification failures through retry operations
**Depends on**: Phase 2
**Requirements**: DASH-03
**Success Criteria** (what must be TRUE):
  1. Admin can retry a single failed notification from the failed notifications list
  2. Admin can bulk retry all failed notifications for an app
  3. Admin can force full re-sync of a repository to recover from edge cases
  4. Retry operations show immediate feedback (loading state, then success/error)
  5. After successful retry, notification moves from failed to sent in the UI
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 4: Enhanced Visibility
**Goal**: Admin can efficiently navigate large datasets through filtering and search
**Depends on**: Phase 3
**Requirements**: None (usability enhancements)
**Success Criteria** (what must be TRUE):
  1. Admin can search apps by name or URL
  2. Admin can filter repositories by monitoring status
  3. Admin can filter notifications by type (create/update/delete)
  4. Admin can sort tables by relevant columns (timestamp, retry count, status)
  5. Large lists are paginated with reasonable page sizes
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 5: Production Hardening
**Goal**: Dashboard is production-ready with security, error handling, and deployment optimization
**Depends on**: Phase 4
**Requirements**: None (hardening work)
**Success Criteria** (what must be TRUE):
  1. CSP headers protect against XSS attacks
  2. Rate limiting prevents abuse of admin endpoints
  3. All error states display user-friendly messages (not stack traces)
  4. Loading states show progress for all async operations
  5. Docker multi-stage build produces optimized image with dashboard assets
  6. Empty states guide admin when no data exists
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Authentication | 0/TBD | Not started | - |
| 2. Dashboard Integration & Core Display | 0/TBD | Not started | - |
| 3. Retry Operations & Actions | 0/TBD | Not started | - |
| 4. Enhanced Visibility | 0/TBD | Not started | - |
| 5. Production Hardening | 0/TBD | Not started | - |
