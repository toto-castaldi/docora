# Phase 15: Version Infrastructure - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Version is derived from STATE.md as the single source of truth and is visible to both the API and dashboard users. The extract script reads the milestone, generates version.ts, syncs package.json, and prints the version for CI consumption. The /version endpoint returns clean build info. The dashboard footer displays the current version.

</domain>

<decisions>
## Implementation Decisions

### Version Format
- Major.minor only (e.g., 1.3), no patch version — milestones are major.minor
- Suffix baked at generation time, not resolved at runtime
- Local dev: `1.3+dev` — CI: `1.3+108.a3bc02d` (build number + short SHA)
- Auto-detect context: if BUILD_NUMBER + COMMIT_SHA env vars are set, use CI format; otherwise default to +dev

### Extract Script (scripts/extract-version.cjs)
- Reads milestone version from the milestone field in STATE.md
- Single script writes both `src/version.ts` and `package.json` version field in one run
- Fails hard (exit code 1) with clear error if STATE.md is missing or milestone unparseable — no fallback
- Prints just the version string to stdout (e.g., `1.3+dev`) — single line, easy to capture
- On-demand only — no prebuild hook; developer or CI runs it explicitly

### Dashboard Footer
- Position: bottom-left of sidebar navigation, always visible
- Content: version + git SHA (e.g., `v1.3+dev (a3bc02d)`)
- Styling: muted gray, small font — present but unobtrusive
- Source: version embedded at dashboard build time, not fetched from API

### /version Endpoint
- Flat response structure: `{ version, buildNumber, gitSha, buildDate }`
- Public endpoint, no authentication required (like /health)
- Build info only — no environment field, no uptime (that's /health's job)
- Remove the stale `fake` field from current response

### Claude's Discretion
- Exact regex/parser for extracting milestone from STATE.md
- version.ts file structure (can simplify or restructure BUILD_INFO)
- Dashboard footer component implementation details
- Error message wording in extract script

</decisions>

<specifics>
## Specific Ideas

- The extract script should work like a simple codegen tool: read STATE.md → write files → print result
- version.ts currently has helper functions (getVersionString, getFullVersionString) — these can be simplified or removed if the baked version string replaces their purpose
- VER-04 format spec: `v1.3+dev` for local, `v1.3+108.a3bc02d` for CI

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-version-infrastructure*
*Context gathered: 2026-02-26*
