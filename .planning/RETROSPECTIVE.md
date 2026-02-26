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

## Milestone: v1.3 — Versioning System

**Shipped:** 2026-02-26
**Phases:** 4 | **Plans:** 7

### What Was Built
- Removed commit-based versioning toolchain (commitlint, czg, cz-git, husky hooks)
- Codegen script: STATE.md → version.ts → package.json → Docker image tags
- Dashboard sidebar version display via Vite build-time injection
- Push-to-deploy CI/CD pipeline (build-test → docker → deploy on every push to main)
- Admin onboard form with validated fields, reusable FormField/PasswordField components
- Credentials modal with copy-to-clipboard and one-time token warning

### What Worked
- Codegen pattern: baking version at build time eliminated all runtime env resolution for version data
- Comment-preserved disabled jobs: keeping docker/deploy config as comments during Phase 14 gave Phase 16 exact reference
- Component extraction: splitting FormField, PasswordField, CopyField kept all files under 150 lines and created reusable UI patterns
- Phase ordering: Phase 14 cleanup first unblocked all subsequent phases cleanly

### What Was Inefficient
- STATE.md milestone field not updated to v1.3 during milestone start — caught only during audit, cascaded to all version outputs
- ROADMAP.md progress table had formatting drift again (missing milestone column for phases 14, 15, 17)
- gsd-tools milestone complete CLI counted all phases across all milestones (9/32) instead of v1.3 phases only (4/7) — required manual fix

### Patterns Established
- `scripts/extract-version.cjs` codegen pattern: STATE.md → generated TypeScript module
- Vite define for build-time constants from generated source files
- Reusable form components: FormField (labeled input/textarea), PasswordField (show/hide toggle), CopyField (clipboard feedback)
- Native HTML dialog for credentials display (consistent with existing ConfirmDialog pattern)

### Key Lessons
1. Always update STATE.md milestone field at milestone start — downstream version chain depends on it
2. CommonJS (.cjs) scripts avoid ESM configuration dependency for build tooling
3. package.json semver ({major}.{minor}.0) and internal version ({major}.{minor}+suffix) serve different consumers — keep both
4. Form reset on modal close (not on API success) gives better UX when credentials need to be copied

### Cost Observations
- Model mix: quality profile (opus for planning, sonnet for execution)
- Average plan execution: 2.0 min (fastest milestone — toolchain cleanup and infra tasks are simpler)
- Notable: entire 4-phase milestone completed in ~10 minutes of execution time

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Avg Plan Duration | Key Change |
|-----------|--------|-------|-------------------|------------|
| v1.0 | 5 | 25 | 3.5 min | Initial dashboard build — established patterns |
| v1.1 | 4 | 6 | 2.6 min | Polish and resilience — fast iteration |
| v1.2 | 4 | 7 | 4.5 min | Hardening and lifecycle — more complex per-plan |
| v1.3 | 4 | 7 | 2.0 min | Versioning and onboarding — fastest execution |

### Cumulative Stats

| Milestone | Total Plans | Execution Time | Files Changed |
|-----------|------------|----------------|---------------|
| v1.0 | 25 | 1.52 hours | ~100+ |
| v1.1 | 6 | 0.25 hours | 25 |
| v1.2 | 7 | 0.52 hours | 67 |
| v1.3 | 7 | 0.16 hours | 121 |

### Top Lessons (Verified Across Milestones)

1. Phase independence enables faster planning and execution — phases without cross-dependencies consistently execute cleanly
2. Existing patterns (admin-auth, BullMQ queue singletons, shared-types) accelerate new feature development — convention over configuration pays off
3. Audit before archival catches integration gaps that per-phase verification misses
4. STATE.md data must be kept current — downstream codegen chains amplify stale data into production artifacts
