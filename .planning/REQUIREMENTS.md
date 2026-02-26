# Requirements: Docora

**Defined:** 2026-02-25
**Core Value:** See failures before clients report them, and fix them with one click.

## v1.3 Requirements

Requirements for milestone v1.3 — Versioning System. Each maps to roadmap phases.

### Cleanup

- [x] **CLEAN-01**: commitlint, czg, cz-git dependencies removed from package.json
- [x] **CLEAN-02**: commit-msg and prepare-commit-msg husky hooks removed (pre-commit kept for typecheck)
- [x] **CLEAN-03**: commitlint.config.js removed
- [x] **CLEAN-04**: CI release job removed (no commit analysis, tagging, or version-bump commits)

### Version Infrastructure

- [x] **VER-01**: scripts/extract-version.cjs reads milestone version from STATE.md
- [x] **VER-02**: Extract script generates src/version.ts with version baked as string literal
- [x] **VER-03**: Extract script syncs package.json version field
- [x] **VER-04**: Version format uses major.minor only (v1.3+dev local, v1.3+108.a3bc02d CI)
- [x] **VER-05**: Extract script prints version to stdout for CI consumption
- [x] **VER-06**: GET /version route returns clean response (remove stale `fake` field)

### CI/CD

- [x] **CI-01**: Every push to main triggers build + Docker push + deploy
- [x] **CI-02**: CI extracts version from STATE.md via extract script for Docker image tagging
- [x] **CI-03**: Build metadata (run number, SHA, date) available in running containers

### Onboarding UI

- [ ] **ONBD-01**: Admin can access onboard page from dashboard navigation
- [ ] **ONBD-02**: Onboard form validates app_name, base_url, email, client_auth_key (+ optional website, description)
- [ ] **ONBD-03**: After successful onboarding, modal shows app_id and token with copy-to-clipboard
- [ ] **ONBD-04**: Modal warns that token will not be shown again

### Dashboard

- [x] **DASH-09**: Dashboard layout shows current version in footer

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Observability

- **OBS-01**: Full notification delivery history/audit log (requires new table)
- **OBS-02**: Email/Slack alerting for failures

### Multi-Admin

- **ADM-01**: Multi-user admin with RBAC

## Out of Scope

| Feature | Reason |
|---------|--------|
| Git tags for releases | GSD-native versioning uses STATE.md, no tags needed |
| Patch version numbers | major.minor only per VERSIONING.md spec |
| Conventional commits for versioning | Commits still follow convention for readability, not for version bumping |
| Client self-service onboarding | Admin-only by design |
| OAuth/SSO authentication | Simple username/password sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLEAN-01 | Phase 14 | Complete |
| CLEAN-02 | Phase 14 | Complete |
| CLEAN-03 | Phase 14 | Complete |
| CLEAN-04 | Phase 14 | Complete |
| VER-01 | Phase 15 | Complete |
| VER-02 | Phase 15 | Complete |
| VER-03 | Phase 15 | Complete |
| VER-04 | Phase 15 | Complete |
| VER-05 | Phase 15 | Complete |
| VER-06 | Phase 15 | Complete |
| CI-01 | Phase 16 | Complete |
| CI-02 | Phase 16 | Complete |
| CI-03 | Phase 16 | Complete |
| ONBD-01 | Phase 17 | Pending |
| ONBD-02 | Phase 17 | Pending |
| ONBD-03 | Phase 17 | Pending |
| ONBD-04 | Phase 17 | Pending |
| DASH-09 | Phase 15 | Complete |

**Coverage:**
- v1.3 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-26 after 14-02 execution*
