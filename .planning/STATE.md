# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** See failures before clients report them, and fix them with one click.
**Current focus:** v1.1 Phase 8 — Failure Notifications

## Current Position

Phase: 8 of 9 (Failure Notifications)
Plan: 1 of 2 in current phase
Status: Executing
Last activity: 2026-02-15 — Plan 08-01 complete (sync_failed notification service)

Progress: [█████████████████████████░░░░░] 79% (25/25 v1.0 complete, 3/4 v1.1 done)

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 25
- Average duration: 3.5 min
- Total execution time: 1.52 hours
- Timeline: 38 days (2026-01-06 -> 2026-02-13)

**v1.1 Velocity:**
- Total plans completed: 3
- Average duration: 2.7 min
- Total execution time: 0.13 hours

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table.

v1.1 context from codebase analysis:
- Global repos page removed (06-01) — repo info now only in AppDetail per-app view
- PATCH /api/repositories/:repository_id/token endpoint added (07-01)
- Circuit breaker logic in `src/repositories/repositories.ts` (recordGitFailure)
- Docs site is Hugo-based in `docs-site/` with single page at `docs-site/content/_index.md`

Phase 8 decisions:
- Fire-and-forget pattern for sync_failed: never block worker or BullMQ retry
- Circuit breaker env vars read in worker directly (avoid coupling to repositories.ts)
- Sequential notification delivery to avoid overwhelming client endpoints
- 10s timeout for sync_failed POST (lightweight payload)

Phase 7 decisions:
- Status reset to pending_snapshot on token update to trigger fresh scan
- Circuit breaker reset alongside app-repo error state for clean restart

Phase 6 decisions:
- RepositorySummary type kept in shared-types (used by AppDetailRepoTable)
- RepositoryWithStatus type kept (used by listRepositoriesByApp and dashboard-api-apps)
- AppRepositoryStatus import removed (only used by deleted listAllRepositories)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 08-01-PLAN.md (sync_failed notification service)
Resume file: None
