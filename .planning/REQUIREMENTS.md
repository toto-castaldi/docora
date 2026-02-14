# Requirements: Docora v1.1 Polish & Resilience

**Defined:** 2026-02-14
**Core Value:** See failures before clients report them, and fix them with one click.

## v1.1 Requirements

Requirements for v1.1 release. Each maps to roadmap phases.

### Dashboard Cleanup

- [ ] **DCLEAN-01**: Admin repositories page is removed from dashboard navigation and routes
- [ ] **DCLEAN-02**: Backend admin API endpoints for global repository listing are removed

### Token Management

- [ ] **TOKEN-01**: App can update GitHub token for a private repo via PATCH endpoint without losing delivery history
- [ ] **TOKEN-02**: Token update validates against GitHub API before persisting
- [ ] **TOKEN-03**: Token update resets error state (retry_count, last_error) for a fresh start

### Failure Notifications

- [ ] **NOTIFY-01**: App receives a sync_failed webhook when circuit breaker opens for a watched repository
- [ ] **NOTIFY-02**: Sync failure notification includes error type, message, retry count, and circuit breaker status
- [ ] **NOTIFY-03**: Sync failure notification uses same HMAC authentication as file notifications

### Documentation Site

- [ ] **DOCS-01**: Homepage explains what Docora is, its value proposition, and how it works
- [ ] **DOCS-02**: API section documents onboard endpoint (POST /api/apps/onboard) with request/response schemas
- [ ] **DOCS-03**: API section documents repository endpoints (POST /api/repositories, DELETE, PATCH)
- [ ] **DOCS-04**: Webhook section documents all notification types sent to apps (create, update, delete, sync_failed)
- [ ] **DOCS-05**: Site has clear navigation between homepage, API docs, and webhook docs

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Delivery History

- **HIST-01**: Admin can view full delivery history per app-repository pair
- **HIST-02**: Admin can search delivery history by file path

### Alerting

- **ALERT-01**: Admin receives email/Slack alert when circuit breaker opens
- **ALERT-02**: Admin can configure alert thresholds and channels

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full delivery history/audit log | Requires new table, deferred to v2 |
| Email/Slack admin alerting | Deferred to v2, focus on app notifications first |
| Client-facing dashboard | Admin-only for now |
| Sync recovery notification | When circuit closes again — nice to have, not v1.1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DCLEAN-01 | Phase 6 | Pending |
| DCLEAN-02 | Phase 6 | Pending |
| TOKEN-01 | Phase 7 | Pending |
| TOKEN-02 | Phase 7 | Pending |
| TOKEN-03 | Phase 7 | Pending |
| NOTIFY-01 | Phase 8 | Pending |
| NOTIFY-02 | Phase 8 | Pending |
| NOTIFY-03 | Phase 8 | Pending |
| DOCS-01 | Phase 9 | Pending |
| DOCS-02 | Phase 9 | Pending |
| DOCS-03 | Phase 9 | Pending |
| DOCS-04 | Phase 9 | Pending |
| DOCS-05 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*
