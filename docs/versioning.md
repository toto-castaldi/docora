# Versioning Strategy

> Specification for Docora's versioning system with Auto-Release and Conventional Commits.

## Overview

Docora uses **Semantic Versioning** (SemVer) with a **single version** that governs the entire stack.

The version is managed through **Auto-Release** (custom job in GitHub Actions) for:
- Automatic bump based on commits (feat/fix)
- Fully automatic releases without PRs
- Git tags and immediate deployment

## Single Source of Truth

```
src/version.ts  ← SINGLE source of truth
```

## How It Works

### 1. Write commits with Conventional Commits

```bash
git commit -m "feat: add dark mode"
git commit -m "fix: correct login redirect"
git push origin main
```

### 2. Auto-Release analyzes and releases

After every push to `main`, the GitHub action:
- Counts `feat:` and `fix:` commits since the last tag
- Calculates the new version (minor for `feat:`, patch for `fix:`, major for breaking `!`)
- Automatically updates version files
- Creates commit `chore(release): vX.Y.Z`
- Creates and pushes the Git tag

### 3. Automatic deployment

After the version bump:
- Deploy jobs run `git pull` to get the updated version
- The service is deployed with the new version
- No manual intervention required

## Conventional Commits Reference

| Type | Description | Bump |
|------|-------------|------|
| `feat` | New feature | MINOR (0.x.0) |
| `fix` | Bug fix | PATCH (0.0.x) |
| `feat!` or `fix!` | Breaking change | MAJOR (x.0.0) |
| `docs` | Documentation only | None |
| `style` | Formatting | None |
| `refactor` | Refactoring | None |
| `perf` | Performance | PATCH |
| `test` | Tests | None |
| `chore` | Build, CI, deps | None |

### Examples

```bash
feat(study): add timer during study session    # → 0.2.0
fix(auth): handle expired token refresh        # → 0.1.7
docs(readme): update installation steps        # → no bump
chore(deps): upgrade vite to 6.0               # → no bump
feat!: redesign API response format            # → 1.0.0 (breaking)
```

## Configuration

### Configuration Files

| File | Purpose |
|------|---------|
| `.release-please-manifest.json` | Current version (used for tracking) |
| `.github/workflows/ci-deploy.yml` | Unified workflow (auto-release + CI/CD) |
| `src/version.ts` | Single source of truth for the version |


## Commit Linting (Husky)

The project uses **husky** + **commitlint** to validate commits.


Non-conforming commits are rejected:

```bash
# Rejected
git commit -m "added new feature"

# Accepted
git commit -m "feat: add new feature"
```
