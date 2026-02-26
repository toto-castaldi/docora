# Phase 14: Toolchain Cleanup - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the old commit-based versioning toolchain (commitlint, czg, cz-git, husky) and CI release job. No hooks remain after this phase. The development workflow must still work (install, build, test, commit) but without any git hook enforcement or automated release machinery.

**Note:** The roadmap success criteria originally required keeping the pre-commit typecheck hook. User overrides this — ALL hooks and husky are removed. Typecheck is run manually or by CI, not on commit.

</domain>

<decisions>
## Implementation Decisions

### Commit convention going forward
- Keep conventional commit format (feat:, fix:, docs:, etc.) as informal practice — no enforcement
- Update CLAUDE.md: replace the Conventional Commits section with a one-liner about preferred style (not enforced)
- Remove bump annotations (MINOR, PATCH, MAJOR) from CLAUDE.md — version semantics no longer tied to commits
- Remove the auto-release mention from CLAUDE.md — old mechanism is being deleted

### Husky and hooks removal
- Remove ALL git hooks — commit-msg, prepare-commit-msg, AND pre-commit (overrides roadmap SC #3)
- Remove husky entirely: .husky directory, husky devDependency, "prepare" script from package.json
- Audit and remove any other unused devDependencies found during cleanup

### CI release job scope
- Remove everything release-related from CI: the release job, changelog generation, tag pushing, version-bump commits
- Leave non-release CI pieces (build, test, deploy) untouched — Phase 16 will redesign the pipeline
- Remove release-related npm scripts from package.json
- Reset package.json version to "0.0.0" as neutral placeholder (Phase 15 will derive from STATE.md)

### Claude's Discretion
- Determining which devDependencies are unused beyond the explicitly listed ones
- Order of removals and how to structure the cleanup commits
- Whether any config files beyond commitlint.config.js need removal (e.g., .czrc, czg config)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward removal task. Clean and complete.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-toolchain-cleanup*
*Context gathered: 2026-02-25*
