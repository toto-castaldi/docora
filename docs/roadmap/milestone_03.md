Repository Registration & API Authentication
============================================

> **STATUS: COMPLETED** - Implemented in v0.3.0

# Summary

This milestone introduces repository registration for onboarded apps and secures all API endpoints with Bearer token authentication. Apps can register GitHub repositories they want Docora to monitor.

# Goals

- Secure all API endpoints with Bearer token authentication
- Provide repository registration endpoint for onboarded apps
- Validate GitHub repository accessibility before accepting registration
- Store repository metadata for future monitoring

# User Story

As an onboarded app, I want to register GitHub repositories so Docora can monitor them for changes and notify me.

# Scope

## Included

- Authentication middleware (Bearer token validation)
- Repository registration endpoint
- GitHub API validation (repo exists, token has access)
- Repository metadata storage

## Not Included

- Plugin configuration (future milestone)
- Initial snapshot/scan (future milestone)
- Repository updates/deletion (future milestone)

# API Contract

## Authentication

All endpoints (except `/health`, `/version`, `/api/apps/onboard`) require:

```
Authorization: Bearer <token>
```

## Endpoint

POST /api/repositories

```code
Request Body
{
  "github_url": "https://github.com/owner/repo",
  "github_token": "ghp_xxxx"  // optional, for private repos
}
```

```code
Response (201 Created)
{
  "repository_id": "repo_abc123",
  "github_url": "https://github.com/owner/repo",
  "owner": "owner",
  "name": "repo",
  "is_private": false,
  "created_at": "2025-01-08T12:00:00Z"
}
```

# Validation Rules

| Field | Rules |
|-------|-------|
| `github_url` | Required, must be valid GitHub URL (`https://github.com/{owner}/{repo}`) |
| `github_token` | Optional, if provided must start with `ghp_` or `github_pat_` |

## GitHub Validation

- Parse owner/repo from URL
- Call GitHub API to verify repository exists
- If `github_token` provided, verify it has read access
- Block registration if repo doesn't exist or token is invalid

# Error Handling

| Status | Scenario |
|--------|----------|
| 401 Unauthorized | Missing or invalid Bearer token |
| 400 Bad Request | Missing required fields |
| 404 Not Found | GitHub repository doesn't exist |
| 422 Unprocessable Entity | Invalid URL format, invalid GitHub token |

**Note:** Re-registering the same repository is allowed. Docora will automatically unwatch the existing registration (cleanup) and create a fresh one. The client will receive all files as a new initial snapshot.

# Technology Additions

| Component | Choice |
|-----------|--------|
| GitHub API | Octokit (`@octokit/rest`) |

---

# Implementation Phases

## Phase 1: Dependencies

```bash
pnpm add @octokit/rest
```

---

## Phase 2: Database Schema (Liquibase)

**Data Model:** Many apps can watch the same repository. Docora monitors each unique repo once and notifies all registered apps.

```
apps ──< app_repositories >── repositories
```

**Files to create:**

| File | Purpose |
|------|---------|
| `deploy/liquibase/changelog/002-create-repositories-table.yml` | Repositories + junction table migration |

**Repositories table (unique repos):**

```sql
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id VARCHAR(50) UNIQUE NOT NULL,
    github_url VARCHAR(2048) UNIQUE NOT NULL,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repositories_repository_id ON repositories(repository_id);
CREATE INDEX idx_repositories_github_url ON repositories(github_url);
```

**App-Repository junction table:**

```sql
CREATE TABLE app_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id VARCHAR(50) NOT NULL REFERENCES apps(app_id),
    repository_id VARCHAR(50) NOT NULL REFERENCES repositories(repository_id),
    github_token_encrypted VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, repository_id)
);

CREATE INDEX idx_app_repositories_app_id ON app_repositories(app_id);
CREATE INDEX idx_app_repositories_repository_id ON app_repositories(repository_id);
```

**Modify:**

| File | Change |
|------|--------|
| `deploy/liquibase/changelog/db.changelog-master.yml` | Add include for 002 migration |

---

## Phase 3: Database Types

**File to modify:**

| File | Change |
|------|--------|
| `src/db/types.ts` | Add `RepositoriesTable`, `AppRepositoriesTable` interfaces and update `Database` |

---

## Phase 4: Authentication Middleware

**Files to create:**

| File | Purpose |
|------|---------|
| `src/plugins/auth.ts` | Fastify plugin for Bearer token authentication |

**Logic:**

1. Extract `Authorization: Bearer <token>` header
2. Query all apps, verify token against each `token_hash` with bcrypt
3. If valid, attach `app_id` to request context
4. If invalid, return 401 Unauthorized

**Public routes (no auth required):**

- `GET /health`
- `GET /version`
- `POST /api/apps/onboard`

---

## Phase 5: Utilities

**Files to create:**

| File | Purpose |
|------|---------|
| `src/utils/github.ts` | `parseGitHubUrl()`, `validateRepository()` |
| `src/utils/crypto.ts` | `encryptToken()`, `decryptToken()` for GitHub token storage |

**GitHub URL parsing:**

- Extract `owner` and `name` from `https://github.com/{owner}/{repo}`
- Validate format

**GitHub validation:**

- Use Octokit to call `repos.get({ owner, repo })`
- If `github_token` provided, use authenticated client

---

## Phase 6: Zod Schemas

**Files to create:**

| File | Purpose |
|------|---------|
| `src/schemas/repositories.ts` | `RegisterRepositoryRequestSchema`, `RegisterRepositoryResponseSchema` |

---

## Phase 7: Repository Layer

**Files to create:**

| File | Purpose |
|------|---------|
| `src/repositories/repositories.ts` | `findOrCreateRepository()`, `linkAppToRepository()`, `findByAppId()` |

**Logic for registration:**

1. Check if repo exists in `repositories` table (by `github_url`)
2. If not, create new entry in `repositories`
3. Check if app already linked to this repo in `app_repositories`
4. If already linked, unwatch first (cleanup deliveries, check orphan)
5. Create entry in `app_repositories` (with encrypted GitHub token if provided)

---

## Phase 8: Route Implementation

**Files to create:**

| File | Purpose |
|------|---------|
| `src/routes/repositories/index.ts` | Route aggregator |
| `src/routes/repositories/register.ts` | `POST /api/repositories` handler |

**File to modify:**

| File | Change |
|------|--------|
| `src/routes/index.ts` | Import and register `repositoriesRoutes` |

---

## Phase 9: Server Integration

**File to modify:**

| File | Change |
|------|--------|
| `src/server.ts` | Register auth plugin |

---

## Phase 10: Testing

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/plugins/auth.test.ts` | Auth middleware tests |
| `tests/utils/github.test.ts` | GitHub utility tests |
| `tests/routes/repositories/register.test.ts` | Endpoint integration tests |

---

# File Structure

```
src/
  db/
    types.ts                    (MODIFY - add RepositoriesTable, AppRepositoriesTable)
  plugins/
    auth.ts                     (NEW)
    swagger.ts                  (existing)
  repositories/
    apps.ts                     (existing)
    repositories.ts             (NEW)
  routes/
    repositories/
      index.ts                  (NEW)
      register.ts               (NEW)
    index.ts                    (MODIFY)
  schemas/
    apps.ts                     (existing)
    repositories.ts             (NEW)
  utils/
    github.ts                   (NEW)
    crypto.ts                   (NEW)
    token.ts                    (existing)
    url-validator.ts            (existing)
  server.ts                     (MODIFY)

tests/
  plugins/
    auth.test.ts                (NEW)
  routes/repositories/
    register.test.ts            (NEW)
  utils/
    github.test.ts              (NEW)

deploy/liquibase/changelog/
  db.changelog-master.yml       (MODIFY)
  002-create-repositories-table.yml (NEW)
```

---

# Security Implementation

| Aspect | Implementation |
|--------|----------------|
| API Authentication | Bearer token validated against bcrypt hashes |
| GitHub Token Storage | AES-256 encryption at rest |
| Token Validation | bcrypt.compare() with constant-time comparison |
| Public Endpoints | Explicitly whitelisted (`/health`, `/version`, `/api/apps/onboard`) |

---

# Environment Variables

Add to `.env.example`:

```
ENCRYPTION_KEY=<32-byte-hex-key-for-aes-256>
```

---

# Acceptance Criteria

- All API endpoints (except public ones) require valid Bearer token
- Invalid/missing token returns 401 Unauthorized
- Repository registration validates GitHub URL format
- Repository registration validates repo exists via GitHub API
- Private repo tokens are encrypted before storage
- Same repo can be re-registered by the same app (automatic unwatch + fresh registration)
- Multiple apps can register the same repository (shared monitoring)
- All tests pass

---

# Verification

1. **Run tests**: `pnpm test`
2. **Manual testing**:
   - Start server: `pnpm dev`
   - Onboard App A: `POST /api/apps/onboard` (get token A)
   - Onboard App B: `POST /api/apps/onboard` (get token B)
   - Try registering repo without token → 401
   - App A registers repo with valid token → 201
   - App A registers same repo again → 201 (re-registration: unwatch + fresh register)
   - App B registers same repo → 201 (different app, allowed)
