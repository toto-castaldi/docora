# Feature Research

**Domain:** Admin Monitoring Dashboard for Webhook/Job Queue Service
**Researched:** 2026-01-26
**Confidence:** MEDIUM (based on WebSearch verified with official documentation patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features the admin assumes exist. Missing these = dashboard is useless for its core purpose.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **View failed notifications** | Core problem to solve — see failures before clients complain | LOW | Query `app_repositories` where `status='failed'`, display `last_error` |
| **Retry failed notifications** | Useless to see failures if you can't fix them | LOW | Reset status to `pending_snapshot` triggers re-scan |
| **View job queue status** | Must know if system is healthy (backed up, stuck, processing) | LOW | BullMQ provides `getJobCounts()` — pending, active, completed, failed |
| **View registered apps** | Need to see who is using the system | LOW | Query `apps` table |
| **View repositories per app** | Understand what each app monitors | LOW | Query `app_repositories` joined with `repositories` |
| **View delivery status** | Know if notifications reached clients successfully | LOW | Query `app_repositories.status` — synced/failed/pending/scanning |
| **Basic authentication** | Dashboard must be protected | MEDIUM | Username/password, JWT session |
| **Error details display** | "Failed" is useless without knowing why | LOW | Display `last_error` from `app_repositories` |

### Differentiators (Competitive Advantage)

Features that improve the experience but aren't strictly required for MVP.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Bulk retry** | Retry all failed notifications in one click | LOW | Batch update all `status='failed'` to `pending_snapshot` |
| **Notification history/timeline** | See what was sent when, not just current state | MEDIUM | Requires new table to log notification events |
| **Success rate metrics** | Understand system health at a glance (e.g., "98% delivery rate") | MEDIUM | Aggregate queries, possibly time-series |
| **Circuit breaker status** | See which repos have Git issues paused | LOW | Query `repositories.circuit_open_until` |
| **Queue depth trend** | Historical view of queue health | HIGH | Requires time-series storage |
| **Filter/search** | Find specific app or repo quickly | LOW | Frontend filtering |
| **Retry count visibility** | See how many times a notification has been retried | LOW | Display `app_repositories.retry_count` |
| **Force full re-sync** | Trigger complete re-scan of a repository for an app | LOW | Clear `app_delivered_files`, reset status |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this use case.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time WebSocket updates** | Feels more "modern" and responsive | Adds complexity (connection management, reconnection, state sync), polling every 30s is fine for single admin | Poll on interval, add manual refresh button |
| **Detailed job payload inspection** | Debug by seeing exact data sent | Security risk (may expose file contents, tokens), adds UI complexity | Show metadata only (path, sha, timestamps), keep full logs server-side |
| **Delete/remove apps from dashboard** | "Clean up" old apps | Destructive action that could break clients, dangerous for v1 | Read-only for v1; if needed, add confirmation dialogs |
| **Edit notification endpoints** | Change where notifications go | Should use API for config changes, not admin UI | Read-only display of endpoints |
| **Multi-user admin with roles** | "Enterprise" feature request | Overkill for single-developer use case, adds auth complexity | Single admin account for v1 |
| **Custom dashboards/widgets** | "Personalize" the view | Development time sink, single admin doesn't need personalization | Fixed, opinionated layout |
| **Advanced analytics/BI** | Charts and trends everywhere | Scope creep — this is operational monitoring, not business intelligence | Basic counts and status indicators |
| **Email/Slack alerts** | Proactive notifications of failures | Adds external dependencies, single admin can check dashboard regularly | v2 feature if needed |

## Feature Dependencies

```
[Authentication]
    |
    v
[View Apps] -----> [View Repositories per App]
                          |
                          v
                   [View Delivery Status]
                          |
                          +---> [View Failed Notifications]
                          |            |
                          |            v
                          |     [Retry Failed Notifications]
                          |
                          +---> [Force Full Re-sync]

[View Job Queue Status] (independent, no dependencies)

[Notification History] --requires--> [Notification Event Logging Table]
```

### Dependency Notes

- **Authentication is foundational:** All other features require auth to be in place first
- **View Apps is prerequisite to viewing repositories:** UI navigation flows from apps to repos
- **View Failed requires View Delivery Status:** You need to display status before you can filter to failed
- **Retry requires View Failed:** Can't retry what you can't see
- **Notification History requires schema change:** New table needed, defer to v1.x
- **Job Queue Status is independent:** BullMQ API, no dependency on other features

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to solve the core problem: "see failures before clients complain, fix with one click."

- [x] **Simple authentication** — protect the dashboard
- [x] **View registered apps** — know who's using the system
- [x] **View repositories per app with status** — see what's monitored and current state
- [x] **View failed notifications with error details** — the core need
- [x] **Retry individual failed notifications** — fix problems
- [x] **View job queue counts** — is the system healthy?

### Add After Validation (v1.x)

Features to add once core is working and admin workflow is validated.

- [ ] **Bulk retry all failed** — efficiency when multiple failures
- [ ] **Circuit breaker visibility** — see which repos have Git issues
- [ ] **Force full re-sync** — recover from edge cases
- [ ] **Filter/search apps and repos** — quality of life as list grows
- [ ] **Retry count display** — understand which failures are chronic

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Notification history/audit log** — requires schema change
- [ ] **Success rate metrics** — nice to have analytics
- [ ] **Real-time updates** — only if polling proves insufficient
- [ ] **Email/Slack alerts** — if proactive notification is needed
- [ ] **Multi-admin support** — if team grows

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Authentication | HIGH | MEDIUM | P1 |
| View Apps | HIGH | LOW | P1 |
| View Repos + Status | HIGH | LOW | P1 |
| View Failed Notifications | HIGH | LOW | P1 |
| Retry Failed | HIGH | LOW | P1 |
| View Queue Counts | MEDIUM | LOW | P1 |
| Error Details Display | HIGH | LOW | P1 |
| Bulk Retry | MEDIUM | LOW | P2 |
| Circuit Breaker Status | MEDIUM | LOW | P2 |
| Force Full Re-sync | MEDIUM | LOW | P2 |
| Filter/Search | LOW | LOW | P2 |
| Notification History | MEDIUM | HIGH | P3 |
| Success Rate Metrics | LOW | MEDIUM | P3 |
| Real-time WebSocket | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (solves core problem)
- P2: Should have, add when possible (improves workflow)
- P3: Nice to have, future consideration (scope creep risk)

## Competitor Feature Analysis

Analysis of existing job queue dashboards (BullMQ ecosystem).

| Feature | Bull-Board | Taskforce.sh | Kuue | Our Approach |
|---------|------------|--------------|------|--------------|
| Queue job counts | Yes | Yes | Yes | Include — table stakes |
| Failed job list | Yes | Yes | Yes | Include — core need |
| Retry failed jobs | Yes | Yes | Yes | Include — core need |
| Job payload inspection | Full payload | Full payload | Full payload | Metadata only (security) |
| Real-time updates | No (refresh) | Yes | Yes | No for v1 (simplicity) |
| Multiple queues | Yes | Yes | Yes | Single queue (our case) |
| Authentication | Basic | Full RBAC | API key | Simple username/password |
| Custom UI | Limited | Extensive | None | Custom React (fits monorepo) |
| Self-hosted | Yes | No (SaaS) | No (SaaS) | Yes (part of Docora) |

**Our differentiation:** We're not building a generic job queue dashboard. We're building a Docora-specific monitoring dashboard that understands apps, repositories, and notification delivery semantics. Generic tools like Bull-Board show queue internals; we show business-level status ("App X failed to receive notification for repo Y").

## Implementation Notes

### Leveraging Existing Data

Most table stakes features use existing database schema:

```sql
-- Failed notifications
SELECT ar.*, r.owner, r.name, a.app_name
FROM app_repositories ar
JOIN repositories r ON ar.repository_id = r.repository_id
JOIN apps a ON ar.app_id = a.app_id
WHERE ar.status = 'failed';

-- Job queue counts
-- Via BullMQ API: queue.getJobCounts()

-- Circuit breaker status
SELECT * FROM repositories WHERE circuit_open_until IS NOT NULL;
```

### New Requirements

For v1, no schema changes needed. Notification history (v1.x+) would require:

```yaml
# Example liquibase migration (not for v1)
- changeSet:
    id: add-notification-events
    author: toto
    changes:
      - createTable:
          tableName: notification_events
          columns:
            - column: {name: id, type: uuid, constraints: {primaryKey: true}}
            - column: {name: app_id, type: varchar(255)}
            - column: {name: repository_id, type: varchar(255)}
            - column: {name: file_path, type: text}
            - column: {name: event_type, type: varchar(50)} # create/update/delete
            - column: {name: status, type: varchar(50)} # success/failed
            - column: {name: http_status, type: integer}
            - column: {name: error_message, type: text}
            - column: {name: created_at, type: timestamp}
```

## Sources

- [Bull-Board GitHub](https://github.com/felixmosh/bull-board) — Open source BullMQ dashboard, feature reference
- [Taskforce.sh](https://taskforce.sh/) — Commercial BullMQ dashboard features
- [Kuue](https://www.kuue.app/) — Hosted BullMQ dashboard feature set
- [BullMQ Documentation](https://docs.bullmq.io/guide/retrying-failing-jobs) — Retry configuration
- [Mission Control Jobs](https://dev.37signals.com/mission-control-jobs/) — Rails job dashboard design
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/) — Dashboard design patterns
- [GitHub Webhook Handling](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries) — Webhook retry patterns
- [Stripe Webhook Documentation](https://docs.stripe.com/webhooks) — Webhook delivery status patterns
- [WeWeb Admin Dashboard Guide](https://www.weweb.io/blog/admin-dashboard-ultimate-guide-templates-examples) — Admin dashboard best practices

---
*Feature research for: Docora Admin Monitoring Dashboard*
*Researched: 2026-01-26*
