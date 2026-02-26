# Roadmap: Docora Admin Dashboard

## Milestones

- ✅ **v1.0 Docora Admin Dashboard** — Phases 1-5 (shipped 2026-02-13)
- ✅ **v1.1 Polish & Resilience** — Phases 6-9 (shipped 2026-02-15)
- ✅ **v1.2 Hardening & App Management** — Phases 10-13 (shipped 2026-02-25)
- **v1.3 Versioning System** — Phases 14-17 (in progress)

## Phases

<details>
<summary>✅ v1.0 Docora Admin Dashboard (Phases 1-5) — SHIPPED 2026-02-13</summary>

- [x] Phase 1: Foundation & Authentication (5/5 plans) — completed 2026-01-29
- [x] Phase 2: Dashboard Integration & Core Display (7/7 plans) — completed 2026-01-29
- [x] Phase 3: Retry Operations & Actions (6/6 plans) — completed 2026-02-08
- [x] Phase 4: Enhanced Visibility (5/5 plans) — completed 2026-02-13
- [x] Phase 5: Production Hardening (2/2 plans) — completed 2026-02-13

See: `.planning/milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 Polish & Resilience (Phases 6-9) — SHIPPED 2026-02-15</summary>

- [x] Phase 6: Dashboard Cleanup (1/1 plan) — completed 2026-02-14
- [x] Phase 7: Token Management (1/1 plan) — completed 2026-02-15
- [x] Phase 8: Failure Notifications (2/2 plans) — completed 2026-02-15
- [x] Phase 9: Documentation Site (2/2 plans) — completed 2026-02-15

See: `.planning/milestones/v1.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.2 Hardening & App Management (Phases 10-13) — SHIPPED 2026-02-25</summary>

- [x] Phase 10: Git Concurrency Fix (1/1 plan) — completed 2026-02-24
- [x] Phase 11: Onboarding Lockdown (2/2 plans) — completed 2026-02-24
- [x] Phase 12: App Deletion Backend (2/2 plans) — completed 2026-02-25
- [x] Phase 13: App Deletion UI (2/2 plans) — completed 2026-02-25

See: `.planning/milestones/v1.2-ROADMAP.md` for full details.

</details>

### v1.3 Versioning System (In Progress)

**Milestone Goal:** Replace commit-based versioning with GSD-native milestone versioning where STATE.md is the single source of truth, simplify CI/CD, and add admin onboarding UI to the dashboard.

- [x] **Phase 14: Toolchain Cleanup** - Remove commitlint/czg/cz-git tooling and old CI release job (completed 2026-02-26)
- [x] **Phase 15: Version Infrastructure** - Build extract-version script and display version in dashboard (completed 2026-02-26)
- [ ] **Phase 16: CI/CD Pipeline** - Simplify pipeline to build-and-deploy on every push to main
- [ ] **Phase 17: Onboarding UI** - Admin can onboard new apps directly from the dashboard

## Phase Details

### Phase 14: Toolchain Cleanup
**Goal**: Old commit-based versioning toolchain is fully removed without breaking the development workflow
**Depends on**: Nothing (first phase of v1.3)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04
**Success Criteria** (what must be TRUE):
  1. Running `pnpm install` completes without commitlint, czg, or cz-git being installed
  2. Making a commit with a non-conventional message succeeds (commit-msg hook no longer enforces format)
  3. The pre-commit hook still runs typecheck on commit (not removed)
  4. CI pipeline no longer has a release job that analyzes commits, creates tags, or bumps versions
**Plans**: TBD

Plans:
- [ ] 14-01: Remove local commit tooling (package.json, husky, commitlint, CLAUDE.md)
- [x] 14-02: Remove CI release job from workflow

### Phase 15: Version Infrastructure
**Goal**: Version is derived from STATE.md as the single source of truth and is visible to both the API and dashboard users
**Depends on**: Phase 14
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05, VER-06, DASH-09
**Success Criteria** (what must be TRUE):
  1. Running `node scripts/extract-version.cjs` reads the milestone from STATE.md and generates `src/version.ts` with the version baked in
  2. After running the extract script, `package.json` version field matches the extracted milestone version
  3. The extract script prints the version string to stdout (consumable by CI)
  4. GET /version returns a response with the milestone-derived version and no stale `fake` field
  5. Dashboard footer displays the current version string
**Plans**: TBD

Plans:
- [x] 15-01: Extract-version script, version.ts generation, /version route cleanup
- [ ] 15-02: Dashboard footer version display

### Phase 16: CI/CD Pipeline
**Goal**: Every push to main automatically builds, tags with the correct version, and deploys without commit analysis
**Depends on**: Phase 15
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):
  1. Pushing any commit to main triggers a CI workflow that builds and pushes a Docker image
  2. The Docker image is tagged with a version derived from STATE.md via the extract script (not from commit history)
  3. Build metadata (run number, commit SHA, build date) is accessible inside running containers
**Plans**: TBD

Plans:
- [ ] 16-01: TBD

### Phase 17: Onboarding UI
**Goal**: Admin can onboard new client apps entirely from the dashboard without using curl or external tools
**Depends on**: Phase 14 (no dependency on versioning phases)
**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04
**Success Criteria** (what must be TRUE):
  1. Admin can navigate to an onboarding page from the dashboard sidebar/navigation
  2. The onboard form validates required fields (app_name, base_url, email, client_auth_key) and accepts optional fields (website, description)
  3. After successful onboarding, a modal displays the generated app_id and token with copy-to-clipboard buttons
  4. The modal clearly warns that the token will not be shown again
**Plans**: TBD

Plans:
- [ ] 17-01: TBD
- [ ] 17-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 14 -> 15 -> 16 -> 17

Note: Phase 17 (Onboarding UI) is independent of Phases 15-16 and could execute after Phase 14 in any order relative to 15-16.

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
| 12. App Deletion Backend | v1.2 | 2/2 | Complete | 2026-02-25 |
| 13. App Deletion UI | v1.2 | 2/2 | Complete | 2026-02-25 |
| 14. Toolchain Cleanup | 2/2 | Complete    | 2026-02-26 | - |
| 15. Version Infrastructure | 2/2 | Complete   | 2026-02-26 | - |
| 16. CI/CD Pipeline | v1.3 | 0/? | Not started | - |
| 17. Onboarding UI | v1.3 | 0/? | Not started | - |
