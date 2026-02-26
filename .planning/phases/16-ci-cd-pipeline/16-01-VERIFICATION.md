---
phase: 16-ci-cd-pipeline
verified: 2026-02-26T09:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 16: CI/CD Pipeline Verification Report

**Phase Goal:** Every push to main automatically builds, tags with the correct version, and deploys without commit analysis
**Verified:** 2026-02-26T09:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                           | Status     | Evidence                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Pushing to main triggers a CI workflow that builds and pushes Docker images to ghcr.io          | VERIFIED   | Workflow triggers on `push` to `main`; `docker` job builds/pushes with `docker/build-push-action@v6`     |
| 2   | Docker images are tagged with a version extracted from STATE.md (not commit history)            | VERIFIED   | `extract-version.cjs` reads `STATE.md` milestone `v1.0`, outputs `1.0+<run>.<sha>`; live test confirmed  |
| 3   | Build metadata (run number, SHA, date) is accessible inside running containers via /version     | VERIFIED   | Dockerfile bakes via build-args -> extract-version -> version.ts; `/version` returns all four fields     |
| 4   | Deploy step SSHs to production server and restarts services with the new images                 | VERIFIED   | `deploy` job uses `appleboy/scp-action` + `appleboy/ssh-action`; runs `docker compose pull` and `up -d` |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                   | Expected                                                             | Status    | Details                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| `Dockerfile`                               | Multi-stage build that runs extract-version before compilation       | VERIFIED  | ARG BUILD_NUMBER/COMMIT_SHA/BUILD_DATE; COPY scripts + STATE.md; RUN extract-version.cjs before pnpm build  |
| `.github/workflows/ci-deploy.yml`          | Complete CI/CD pipeline: build-test, docker push, deploy             | VERIFIED  | Three active jobs with correct dependency chain; no commented-out legacy blocks                             |
| `scripts/extract-version.cjs`             | Reads STATE.md milestone, outputs version string for CI              | VERIFIED  | Reads `milestone: v1.0` from STATE.md; with BUILD_NUMBER=99 COMMIT_SHA=abc1234def outputs `1.0+99.abc1234` |
| `src/routes/version.ts`                    | Returns all BUILD_INFO fields (version, buildNumber, gitSha, buildDate) | VERIFIED | Returns `{ version, buildNumber, gitSha, buildDate }` from `BUILD_INFO` constant                          |
| `deploy/docker-compose.yml`                | Production compose file referenced by CI deploy SCP step             | VERIFIED  | File exists at `deploy/docker-compose.yml`; `deploy/caddy` and `deploy/liquibase` also present            |

### Key Link Verification

| From                              | To                          | Via                                               | Status   | Details                                                                                       |
| --------------------------------- | --------------------------- | ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `.github/workflows/ci-deploy.yml` | `scripts/extract-version.cjs` | CI runs extract-version to get version string     | WIRED    | Line 65: `VERSION=$(BUILD_NUMBER=... COMMIT_SHA=... node scripts/extract-version.cjs)`       |
| `Dockerfile`                      | `scripts/extract-version.cjs` | Docker builder stage runs extract-version         | WIRED    | Line 29: `RUN BUILD_NUMBER=${BUILD_NUMBER} COMMIT_SHA=${COMMIT_SHA} node scripts/extract-version.cjs` |
| `.github/workflows/ci-deploy.yml` | `Dockerfile`                | `build-push-action` passes build-args for metadata | WIRED    | Lines 84-87: `BUILD_NUMBER`, `COMMIT_SHA`, `BUILD_DATE` passed as build-args                |

### Requirements Coverage

| Requirement | Source Plan | Description                                                | Status    | Evidence                                                                                     |
| ----------- | ----------- | ---------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| CI-01       | 16-01-PLAN  | Every push to main triggers build + Docker push + deploy   | SATISFIED | Workflow `on.push.branches: [main]`; docker job (main-gated) + deploy job (after docker)   |
| CI-02       | 16-01-PLAN  | CI extracts version from STATE.md via extract script       | SATISFIED | `docker` job runs `node scripts/extract-version.cjs` with BUILD_NUMBER and COMMIT_SHA       |
| CI-03       | 16-01-PLAN  | Build metadata available in running containers             | SATISFIED | Build-args passed to Dockerfile; extract-version bakes into `version.ts`; `/version` returns it |

No orphaned requirements — all three CI-* requirements mapped to Phase 16 appear in the plan and are satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| —    | —    | —       | —        | None found |

No TODO/FIXME/placeholder patterns. No commented-out job blocks. No empty implementations.

### Human Verification Required

#### 1. Live CI Run on GitHub Actions

**Test:** Push a commit to main and observe the GitHub Actions workflow run.
**Expected:** Three jobs execute in sequence: `build-test` -> `docker` -> `deploy`. Docker images appear in `ghcr.io/toto-castaldi/docora` with a version tag like `1.0+<run_number>.<sha>` and `latest`.
**Why human:** Requires actual GitHub Actions execution, live registry push, and SSH access to production — cannot be verified programmatically without running the pipeline.

#### 2. /version endpoint returns CI metadata in production

**Test:** After a CI-triggered deploy, call `GET /version` on the production server.
**Expected:** Response contains `buildNumber` matching the GitHub run number, `gitSha` matching the commit, and `buildDate` close to the push time.
**Why human:** Verifying that the baked values reflect actual CI metadata (not local dev defaults) requires a real deploy.

### Gaps Summary

No gaps. All four observable truths are verified. The pipeline is structurally complete:

- The `Dockerfile` builder stage correctly orders `extract-version.cjs` before `pnpm build` and accepts `BUILD_NUMBER`, `COMMIT_SHA`, `BUILD_DATE` as `ARG` directives with local-safe defaults.
- The CI workflow has three active jobs in the correct dependency chain (`build-test` -> `docker` -> `deploy`), with the `docker` job gated to main pushes only via `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`.
- The `extract-version.cjs` script was validated live: with `BUILD_NUMBER=99 COMMIT_SHA=abc1234def`, it correctly reads milestone `v1.0` from `STATE.md` and outputs `1.0+99.abc1234`.
- All three requirements (CI-01, CI-02, CI-03) are satisfied. No requirements are orphaned.
- Commit `c08fab6` (Dockerfile) and `018dfb9` (CI workflow) are verified to exist in git history.

The two human verification items relate to live execution of the pipeline — they do not block goal achievement from a structural standpoint.

---

_Verified: 2026-02-26T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
