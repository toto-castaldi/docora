# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — Hardening & App Management

**Shipped:** 2026-02-25
**Phases:** 4 | **Plans:** 7

### What Was Built
- Per-repo distributed mutex (Redlock) for safe concurrent git operations
- Admin-only onboarding with session auth enforcement and updated documentation
- Full app deletion cascade (DB transaction + orphan cleanup + BullMQ job removal)
- Dashboard deletion UI with confirmation dialogs showing impact scope

### What Worked
- Phase independence: Phases 10, 11, 12 had no cross-dependencies, enabling clean parallel planning
- Minimal lock scope design: locking only filesystem git operations kept contention low
- Transaction cascade pattern: FK-safe deletion order inside Kysely transaction with post-transaction cleanup was reliable
- useDeleteApp hook encapsulation: single hook handles mutation + dialog state for both list and detail pages

### What Was Inefficient
- ROADMAP.md progress table had formatting drift (misaligned columns in phases 11-13) — should use gsd-tools to validate table structure
- DeleteAppResult type duplicated between service and shared-types — should have been placed in shared-types only from the start

### Patterns Established
- `withRepoLock(repoPath, jobId, fn)` for any future filesystem-exclusive operations
- Transaction cascade delete with best-effort post-transaction cleanup for orphaned resources
- Worker pre-commit existence check (query before side effects) for deleted entity handling
- Column callback pattern: table hook accepts action callbacks for interactive columns

### Key Lessons
1. Dedicated Redis connections for locking avoids interference with BullMQ queue operations
2. 200 with summary body beats 204 when the UI needs feedback on what happened
3. Worker guards should use `return` (not `throw`) for cleanly aborting jobs for deleted entities — avoids retry loops

### Cost Observations
- Model mix: quality profile (opus for planning, sonnet for execution)
- Average plan execution: 4.5 min (slightly higher than v1.1 due to more complex tasks)
- Notable: 2-day milestone for 4 phases — fastest per-phase velocity yet

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Avg Plan Duration | Key Change |
|-----------|--------|-------|-------------------|------------|
| v1.0 | 5 | 25 | 3.5 min | Initial dashboard build — established patterns |
| v1.1 | 4 | 6 | 2.6 min | Polish and resilience — fast iteration |
| v1.2 | 4 | 7 | 4.5 min | Hardening and lifecycle — more complex per-plan |

### Cumulative Stats

| Milestone | Total Plans | Execution Time | Files Changed |
|-----------|------------|----------------|---------------|
| v1.0 | 25 | 1.52 hours | ~100+ |
| v1.1 | 6 | 0.25 hours | 25 |
| v1.2 | 7 | 0.52 hours | 67 |

### Top Lessons (Verified Across Milestones)

1. Phase independence enables faster planning and execution — phases without cross-dependencies consistently execute cleanly
2. Existing patterns (admin-auth, BullMQ queue singletons, shared-types) accelerate new feature development — convention over configuration pays off
3. Audit before archival catches integration gaps that per-phase verification misses
