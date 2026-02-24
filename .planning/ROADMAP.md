# Roadmap: Docora Admin Dashboard

## Milestones

- ✅ **v1.0 Docora Admin Dashboard** — Phases 1-5 (shipped 2026-02-13)
- ✅ **v1.1 Polish & Resilience** — Phases 6-9 (shipped 2026-02-15)
- **v1.2 Hardening & App Management** — Phases 10-13 (in progress)

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

<details>
<summary>v1.1 Polish & Resilience (Phases 6-9) — SHIPPED 2026-02-15</summary>

- [x] Phase 6: Dashboard Cleanup (1/1 plan) — completed 2026-02-14
- [x] Phase 7: Token Management (1/1 plan) — completed 2026-02-15
- [x] Phase 8: Failure Notifications (2/2 plans) — completed 2026-02-15
- [x] Phase 9: Documentation Site (2/2 plans) — completed 2026-02-15

See: `.planning/milestones/v1.1-ROADMAP.md` for full details.

</details>

### v1.2 Hardening & App Management (In Progress)

**Milestone Goal:** Eliminate the race condition on shared git clones, lock down open onboarding behind admin auth, and give admins the ability to delete apps with full cascade cleanup.

- [x] **Phase 10: Git Concurrency Fix** — Serialize git operations per repository path to prevent corruption under concurrent BullMQ jobs (completed 2026-02-24)
- [x] **Phase 11: Onboarding Lockdown** — Protect app onboarding behind admin authentication and update documentation (completed 2026-02-24)
- [ ] **Phase 12: App Deletion Backend** — Cascade app deletion through all dependent records with safe shared-resource handling
- [ ] **Phase 13: App Deletion UI** — Dashboard interface for triggering and confirming app deletion

## Phase Details

### Phase 10: Git Concurrency Fix
**Goal**: Git operations on shared repository paths are safe under concurrent BullMQ job execution
**Depends on**: Nothing (first phase of v1.2, self-contained)
**Requirements**: RACE-01
**Success Criteria** (what must be TRUE):
  1. Two concurrent snapshot jobs for different apps watching the same private repo both complete without git errors (no `index.lock` failures, no wrong-token fetches)
  2. Two concurrent snapshot jobs for different repos execute in parallel (per-repo locking does not degrade to a global lock)
  3. If a git operation fails mid-lock, the mutex is released and subsequent operations on the same repo proceed normally
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md — Redis-based per-repo distributed mutex with Redlock, integrated into snapshot worker and repository management

### Phase 11: Onboarding Lockdown
**Goal**: Only authenticated admins can register new apps; the security gap of open onboarding is closed
**Depends on**: Nothing (independent of Phase 10)
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. An unauthenticated request to `POST /api/apps/onboard` receives a 401 response with a descriptive error message explaining admin auth is required
  2. A request with only a bearer token (no admin session) to `POST /api/apps/onboard` receives a 401 response (bearer auth alone is insufficient)
  3. An authenticated admin can still onboard new apps successfully through the existing endpoint
  4. The docs site accurately reflects that onboarding requires admin authentication (no stale self-service language)
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md — Relocate onboard route to admin tree with session auth and integration tests
- [x] 11-02-PLAN.md — Update documentation (Hugo site, Bruno collection, CLAUDE.md) for admin-only onboarding

### Phase 12: App Deletion Backend
**Goal**: Admins can delete an app via API with full cascade cleanup, preserving shared resources used by other apps
**Depends on**: Nothing (independent of Phases 10-11)
**Requirements**: DEL-01, DEL-02
**Success Criteria** (what must be TRUE):
  1. Deleting an app removes the app record, its repository links, snapshots, and deliveries in a single operation
  2. Deleting an app that shares a repository with another app preserves the repo clone on disk and the repository record in the database
  3. Deleting an app that is the sole watcher of a repository also removes the local clone and repository record
  4. A BullMQ snapshot job that is in-flight when its app is deleted exits cleanly without FK violations or entering a retry loop
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

### Phase 13: App Deletion UI
**Goal**: Admins can trigger app deletion from the dashboard with clear visibility into what will be affected
**Depends on**: Phase 12 (backend endpoint must exist)
**Requirements**: DEL-03
**Success Criteria** (what must be TRUE):
  1. Admin can initiate app deletion from both the Apps list page and the App Detail page
  2. A confirmation dialog appears before deletion, showing the app name and describing the scope of what will be removed
  3. After successful deletion, the admin is navigated back to the Apps list and the deleted app no longer appears
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

## Progress

**Execution Order:**
Phases 10, 11, 12 are independent. Phase 13 depends on Phase 12.

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
| 10. Git Concurrency Fix | v1.2 | 1/1 | Complete | 2026-02-24 |
| 11. Onboarding Lockdown | v1.2 | 2/2 | Complete | 2026-02-24 |
| 12. App Deletion Backend | v1.2 | 0/? | Not started | - |
| 13. App Deletion UI | v1.2 | 0/? | Not started | - |
