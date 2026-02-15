# Roadmap: Docora Admin Dashboard

## Milestones

- ✅ **v1.0 Docora Admin Dashboard** — Phases 1-5 (shipped 2026-02-13)
- ✅ **v1.1 Polish & Resilience** — Phases 6-9 (shipped 2026-02-15)

## Phases

<details>
<summary>v1.0 Docora Admin Dashboard (Phases 1-5) — SHIPPED 2026-02-13</summary>

- [x] Phase 1: Foundation & Authentication (5/5 plans) — completed 2026-01-29
- [x] Phase 2: Dashboard Integration & Core Display (7/7 plans) — completed 2026-01-29
- [x] Phase 3: Retry Operations & Actions (6/6 plans) — completed 2026-02-08
- [x] Phase 4: Enhanced Visibility (5/5 plans) — completed 2026-02-13
- [x] Phase 5: Production Hardening (2/2 plans) — completed 2026-02-13

See: `.planning/milestones/v1.0-ROADMAP.md` for full details.

</details>

### v1.1 Polish & Resilience — SHIPPED 2026-02-15

**Milestone Goal:** Improve dashboard UX, add client-facing failure notifications, enable token management, and revamp the documentation site.

- [x] **Phase 6: Dashboard Cleanup** - Remove redundant repositories page and its backend endpoints — completed 2026-02-14
- [x] **Phase 7: Token Management** - Enable apps to update GitHub tokens without re-registering — completed 2026-02-15
- [x] **Phase 8: Failure Notifications** - Notify apps when sync fails via circuit breaker — completed 2026-02-15
- [x] **Phase 9: Documentation Site** - Revamp docs into homepage, API docs, and webhook docs — completed 2026-02-15

## Phase Details

### Phase 6: Dashboard Cleanup
**Goal**: Admin dashboard shows repository information only where it matters -- on each app's detail page -- without a redundant global repositories page
**Depends on**: Nothing (independent of other v1.1 phases)
**Requirements**: DCLEAN-01, DCLEAN-02
**Success Criteria** (what must be TRUE):
  1. Admin dashboard navigation no longer shows a "Repositories" link
  2. Navigating to the old repositories page URL returns a 404 or redirects to overview
  3. Admin API no longer exposes global repository listing endpoints (GET /api/admin/repositories returns 404)
  4. App detail page still shows its repositories correctly (no regression)
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md --- Remove repositories page (frontend + backend) and all dead code — completed 2026-02-14

### Phase 7: Token Management
**Goal**: Apps can rotate or update their GitHub token for private repositories without losing delivery history or re-registering
**Depends on**: Nothing (independent of other v1.1 phases)
**Requirements**: TOKEN-01, TOKEN-02, TOKEN-03
**Success Criteria** (what must be TRUE):
  1. App can PATCH a repository's GitHub token and all existing delivery history is preserved
  2. Token update is rejected with a clear error if the new token cannot access the repository on GitHub
  3. After a successful token update, the repository's error state (retry count, last error, circuit breaker) is reset to clean
  4. Existing notification and snapshot behavior continues to work with the new token
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md --- Add PATCH /api/repositories/:repository_id/token endpoint with GitHub validation and error state reset — completed 2026-02-15

### Phase 8: Failure Notifications
**Goal**: Apps are proactively informed when Docora cannot sync a watched repository, using the same trusted webhook mechanism as file notifications
**Depends on**: Nothing (independent of other v1.1 phases)
**Requirements**: NOTIFY-01, NOTIFY-02, NOTIFY-03
**Success Criteria** (what must be TRUE):
  1. App receives a sync_failed webhook POST when the circuit breaker opens for one of its watched repositories
  2. The sync_failed payload includes error type, error message, retry count, and circuit breaker status
  3. The sync_failed webhook is signed with the same HMAC mechanism used for file change notifications
  4. File change notifications (create/update/delete) continue to work without regression
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Create failure-notifier service, data access query, and wire into snapshot worker — completed 2026-02-15
- [x] 08-02-PLAN.md — Document sync_failed webhook in docs-site — completed 2026-02-15

### Phase 9: Documentation Site
**Goal**: Developers integrating with Docora can find clear, navigable documentation covering what Docora is, how to call its API, and what webhooks to expect
**Depends on**: Phase 7, Phase 8 (must document PATCH token endpoint and sync_failed notification type)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05
**Success Criteria** (what must be TRUE):
  1. Homepage clearly explains what Docora is, its value proposition, and how it works at a high level
  2. API documentation covers onboard (POST /api/apps/onboard) and repository endpoints (POST, DELETE, PATCH) with request/response schemas
  3. Webhook documentation covers all four notification types: create, update, delete, and sync_failed
  4. Site has clear navigation allowing users to move between homepage, API docs, and webhook docs
  5. All documented endpoints and webhook payloads match the actual implementation
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md --- Multi-page Hugo structure, homepage content, and navigation — completed 2026-02-15
- [x] 09-02-PLAN.md --- API documentation page and webhook docs restructure — completed 2026-02-15

## Progress

**Execution Order:**
Phases 6, 7, 8 are independent and can execute in any order. Phase 9 executes last.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Authentication | v1.0 | 5/5 | Complete | 2026-01-29 |
| 2. Dashboard Integration & Core Display | v1.0 | 7/7 | Complete | 2026-01-29 |
| 3. Retry Operations & Actions | v1.0 | 6/6 | Complete | 2026-02-08 |
| 4. Enhanced Visibility | v1.0 | 5/5 | Complete | 2026-02-13 |
| 5. Production Hardening | v1.0 | 2/2 | Complete | 2026-02-13 |
| 6. Dashboard Cleanup | v1.1 | 1/1 | Complete | 2026-02-14 |
| 7. Token Management | v1.1 | 1/1 | Complete | 2026-02-15 |
| 8. Failure Notifications | v1.1 | 2/2 | Complete | 2026-02-15 |
| 9. Documentation Site | v1.1 | 2/2 | Complete | 2026-02-15 |
