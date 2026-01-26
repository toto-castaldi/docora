# Requirements

## v1 Requirements

### DASH-01: Admin Authentication
**Description:** Admin can log in with username/password
**Category:** Authentication
**Priority:** Must-have
**Status:** Pending

### DASH-02: View Failed Notifications
**Description:** Admin can view failed notifications with error details
**Category:** Monitoring
**Priority:** Must-have
**Status:** Pending

### DASH-03: Retry Failed Notifications
**Description:** Admin can retry failed notifications
**Category:** Operations
**Priority:** Must-have
**Status:** Pending

### DASH-04: View Job Queue Status
**Description:** Admin can view job queue status (pending count, running count)
**Category:** Monitoring
**Priority:** Must-have
**Status:** Pending

### DASH-05: View Registered Apps
**Description:** Admin can view list of registered apps
**Category:** Monitoring
**Priority:** Must-have
**Status:** Pending

### DASH-06: View Monitored Repositories
**Description:** Admin can view repositories monitored by each app
**Category:** Monitoring
**Priority:** Must-have
**Status:** Pending

### DASH-07: View Update History
**Description:** Admin can view history of sent updates
**Category:** Monitoring
**Priority:** Must-have
**Status:** Pending

### DASH-08: Dashboard Protection
**Description:** Dashboard is protected behind authentication
**Category:** Security
**Priority:** Must-have
**Status:** Pending

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DASH-01 | Phase 1 | Pending |
| DASH-02 | Phase 2 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 2 | Pending |
| DASH-05 | Phase 2 | Pending |
| DASH-06 | Phase 2 | Pending |
| DASH-07 | Phase 2 | Pending |
| DASH-08 | Phase 1 | Pending |

## Coverage

**Total v1 requirements:** 8
**Mapped to phases:** 8/8 (100%)
**Orphaned requirements:** 0

## Out of Scope (v2+)

The following are explicitly deferred from v1:

- Client-facing dashboard (admin-only for now)
- OAuth/SSO authentication (simple username/password sufficient)
- Real-time WebSocket updates (polling/refresh fine for v1)
- Mobile app (web dashboard only)
- Multi-admin support (single admin account for now)
- Notification history/audit log (requires new table, high cost)
- Email/Slack alerts (proactive notification deferred)
- Multi-user admin with RBAC (overkill for single-developer use case)
