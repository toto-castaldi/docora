Initial Snapshot (Async)
========================

> **STATUS: COMPLETED** - Implemented in v0.4.0

# Summary

This milestone introduces the asynchronous repository scanning system. When an app registers a repository, Docora queues it for processing. A background scheduler clones the repository locally, reads all files, applies `.docoraignore` exclusions, and pushes the complete snapshot to the app's registered endpoint.

# Goals

- Implement async job queue with BullMQ + Redis
- Clone repositories locally for efficient file access
- Parse and apply `.docoraignore` exclusions
- Send complete file snapshots (metadata + content) to apps
- Implement retry with exponential backoff for failed notifications
- Prepare plugin pipeline hook (no plugins implemented yet)

# User Story

As an onboarded app that registered a repository, I want to receive the complete repository snapshot at my endpoint so I can process the files.

# Scope

## Included

- BullMQ job queue with Redis
- Persistent local repository clones (`/data/repos/{owner}/{repo}`)
- `.docoraignore` file parsing and exclusion
- Full file content in snapshot payload
- Retry with exponential backoff for app notifications
- Configurable scheduler frequency
- Plugin pipeline interface (hook only, no implementation)

## Not Included

- Actual plugin implementations (future milestone)
- Change detection / updates (future milestone)
- Repository deletion / unwatch (future milestone)

---

# Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        REGISTRATION                               │
│  App → POST /api/repositories → 201                              │
│        (status: "pending_snapshot" in app_repositories)          │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SCHEDULER (BullMQ)                            │
│  [Cron: every N minutes - configurable]                          │
│                                                                   │
│  1. Query app_repositories WHERE status = 'pending_snapshot'     │
│  2. Create job for each pending repository                       │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                     WORKER (BullMQ)                               │
│                                                                   │
│  1. Clone or pull repository → /data/repos/{owner}/{repo}        │
│  2. Read .docoraignore (if exists)                               │
│  3. Walk filesystem, exclude ignored files                       │
│  4. For each file: read content, compute SHA                     │
│  5. [Plugin Pipeline Hook] - transform files (future)            │
│  6. Build snapshot payload                                        │
│  7. POST → app.base_url                                          │
│  8. On success: status = 'synced'                                │
│  9. On failure: retry with exponential backoff                   │
└──────────────────────────────────────────────────────────────────┘
```

---

# App API Contract

Apps must expose an endpoint to receive snapshots. Docora will POST to the `base_url` registered during onboarding.

## Endpoint

```
POST {app.base_url}
Content-Type: application/json
```

## Payload

```json
{
  "event": "initial_snapshot",
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "snapshot": {
    "commit_sha": "a1b2c3d4e5f6...",
    "branch": "main",
    "scanned_at": "2025-01-08T12:00:00Z",
    "files": [
      {
        "path": "src/index.ts",
        "sha": "abc123def456...",
        "size": 1234,
        "content": "import express from 'express';\n..."
      },
      {
        "path": "README.md",
        "sha": "789xyz...",
        "size": 500,
        "content": "# My Project\n..."
      }
    ]
  }
}
```

## Expected Response

| Status | Meaning |
|--------|---------|
| 2xx | Success, snapshot received |
| 4xx | Client error, do not retry |
| 5xx | Server error, retry with backoff |

---

# Database Changes

## Modify: `app_repositories` table

Add columns:

```sql
ALTER TABLE app_repositories ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending_snapshot';
ALTER TABLE app_repositories ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_repositories ADD COLUMN last_error TEXT;
ALTER TABLE app_repositories ADD COLUMN last_scanned_at TIMESTAMPTZ;
```

**Status values:**
- `pending_snapshot` - Waiting for initial scan
- `scanning` - Currently being processed
- `synced` - Successfully sent to app
- `failed` - Max retries exceeded

## New: `repository_snapshots` table

Stores the last known state for future change detection.

```sql
CREATE TABLE repository_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id VARCHAR(50) NOT NULL REFERENCES repositories(repository_id),
    commit_sha VARCHAR(40) NOT NULL,
    branch VARCHAR(255) NOT NULL DEFAULT 'main',
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(repository_id)
);

CREATE INDEX idx_repository_snapshots_repository_id ON repository_snapshots(repository_id);
```

## New: `snapshot_files` table

Stores file metadata for change detection.

```sql
CREATE TABLE snapshot_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
    path VARCHAR(2048) NOT NULL,
    sha VARCHAR(40) NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshot_files_snapshot_id ON snapshot_files(snapshot_id);
CREATE INDEX idx_snapshot_files_path ON snapshot_files(path);
```

---

# .docoraignore

## Location

Repository root: `/.docoraignore`

## Syntax

Gitignore-compatible patterns:

```
# Comment
node_modules/
*.log
dist/
.env
.git/
```

## Default Exclusions

Always excluded (even without .docoraignore):
- `.git/`

## Implementation

Use `ignore` npm package for pattern matching (same library used by eslint, prettier, etc.)

---

# Plugin Pipeline (Hook Only)

## Interface

```typescript
interface DocoraPlugin {
  name: string;
  version: string;
  transform(files: SnapshotFile[]): Promise<SnapshotFile[]>;
}

interface SnapshotFile {
  path: string;
  sha: string;
  size: number;
  content: string;
}
```

## Hook Point

In worker, after reading files and before sending:

```typescript
// Plugin pipeline hook (no plugins in this milestone)
let processedFiles = files;
// for (const plugin of plugins) {
//   processedFiles = await plugin.transform(processedFiles);
// }
```

---

# Retry Policy

## Exponential Backoff

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5 | 16 seconds |

**Formula:** `delay = 2^(attempt-1) * 1000ms`

## Max Retries

Configurable via environment variable. Default: 5

After max retries: status = `failed`, `last_error` populated.

---

# Environment Variables

Add to `.env.example`:

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Scheduler
SCAN_INTERVAL_MS=60000          # How often to check for pending repos (default: 1 minute)
SCAN_CONCURRENCY=5              # Max concurrent repository scans

# Retry
MAX_RETRY_ATTEMPTS=5            # Max notification retries
RETRY_BASE_DELAY_MS=1000        # Base delay for exponential backoff

# Storage
REPOS_BASE_PATH=/data/repos     # Where to clone repositories
```

---

# Technology Additions

| Component | Choice |
|-----------|--------|
| Job Queue | BullMQ |
| Redis Client | ioredis |
| Git Operations | simple-git |
| Ignore Patterns | ignore |
| HTTP Client | undici (built into Node) or axios |

---

# Implementation Phases

## Phase 1: Dependencies

```bash
pnpm add bullmq ioredis simple-git ignore axios
pnpm add -D @types/simple-git
```

---

## Phase 2: Docker - Add Redis

**File to modify:** `deploy/docker-compose.yml`

Add Redis service:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

Add volume:

```yaml
volumes:
  redis_data:
```

**Development:** Standalone Redis container

```bash
docker run -d --name docora-redis \
  -p 6379:6379 \
  redis:7-alpine
```

---

## Phase 3: Database Migration

**File to create:** `deploy/liquibase/changelog/003-snapshot-tables.yml`

- Modify `app_repositories`: add `status`, `retry_count`, `last_error`, `last_scanned_at`
- Create `repository_snapshots` table
- Create `snapshot_files` table

**File to modify:** `deploy/liquibase/changelog/db.changelog-master.yml`

Add include for 003 migration.

---

## Phase 4: Database Types

**File to modify:** `src/db/types/index.ts`

Add interfaces:
- `AppRepositoriesTable` - add new columns
- `RepositorySnapshotsTable`
- `SnapshotFilesTable`

---

## Phase 5: Redis Connection

**File to create:** `src/queue/connection.ts`

- Redis connection singleton
- Graceful shutdown

---

## Phase 6: Docoraignore Parser

**File to create:** `src/utils/docoraignore.ts`

- `parseDocoraignore(repoPath: string): Ignore`
- `isIgnored(ignore: Ignore, filePath: string): boolean`
- Default exclusions (`.git/`)

---

## Phase 7: Git Operations

**File to create:** `src/services/git.ts`

- `cloneOrPull(githubUrl: string, githubToken?: string): Promise<string>` - returns local path
- `getCurrentCommitSha(repoPath: string): Promise<string>`
- `getCurrentBranch(repoPath: string): Promise<string>`
- Handle authentication for private repos

---

## Phase 8: File Scanner

**File to create:** `src/services/scanner.ts`

- `scanRepository(repoPath: string, ignore: Ignore): Promise<ScannedFile[]>`
- Walks filesystem recursively
- Reads content, computes SHA-256
- Returns array of `{ path, sha, size, content }`

---

## Phase 9: Plugin Pipeline Interface

**File to create:** `src/plugins/pipeline.ts`

- `DocoraPlugin` interface
- `PluginPipeline` class (empty implementation, just passthrough)
- Hook point for future plugins

---

## Phase 10: Notification Service

**File to create:** `src/services/notifier.ts`

- `sendSnapshot(app: App, repository: Repository, snapshot: Snapshot): Promise<void>`
- POST to `app.base_url`
- Handle response codes
- Throw on failure (let BullMQ handle retry)

---

## Phase 11: Snapshot Repository

**File to create:** `src/repositories/snapshots.ts`

- `saveSnapshot(repositoryId: string, commitSha: string, files: ScannedFile[]): Promise<void>`
- `getSnapshot(repositoryId: string): Promise<Snapshot | null>`
- Upsert logic (replace previous snapshot)

---

## Phase 12: App Repository Updates

**File to modify:** `src/repositories/repositories.ts`

Add functions:
- `findPendingSnapshots(): Promise<AppRepository[]>`
- `updateStatus(appId: string, repositoryId: string, status: string, error?: string): Promise<void>`
- `incrementRetryCount(appId: string, repositoryId: string): Promise<void>`

---

## Phase 13: BullMQ Worker

**File to create:** `src/workers/snapshot.worker.ts`

Main job processor:

1. Clone/pull repository
2. Parse .docoraignore
3. Scan files
4. Apply plugin pipeline (passthrough for now)
5. Send notification to app
6. Save snapshot to database
7. Update status

BullMQ handles retry with exponential backoff on failure.

---

## Phase 14: BullMQ Scheduler

**File to create:** `src/workers/snapshot.scheduler.ts`

- Runs on interval (configurable)
- Queries `pending_snapshot` repositories
- Creates BullMQ jobs for each

---

## Phase 15: Worker Entry Point

**File to create:** `src/worker.ts`

Separate entry point for running workers:
- Initialize Redis connection
- Initialize database connection
- Start scheduler
- Start worker
- Graceful shutdown handlers

---

## Phase 16: Server Integration

**File to modify:** `src/index.ts`

- Option to run API only, worker only, or both
- Environment variable: `RUN_MODE=api|worker|all`

---

## Phase 17: Testing

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/utils/docoraignore.test.ts` | Ignore pattern tests |
| `tests/services/git.test.ts` | Git operations tests (with mock) |
| `tests/services/scanner.test.ts` | File scanner tests |
| `tests/services/notifier.test.ts` | Notification tests (with mock) |
| `tests/workers/snapshot.worker.test.ts` | Worker integration tests |

---

# File Structure

```
src/
├── db/
│   └── types/
│       ├── index.ts                 (MODIFY)
│       ├── apps.ts                  (existing)
│       ├── repositories.ts          (MODIFY - add status columns)
│       └── snapshots.ts             (NEW)
├── plugins/
│   ├── auth.ts                      (existing)
│   ├── swagger.ts                   (existing)
│   └── pipeline.ts                  (NEW - plugin interface)
├── queue/
│   └── connection.ts                (NEW)
├── repositories/
│   ├── apps.ts                      (existing)
│   ├── repositories.ts              (MODIFY)
│   └── snapshots.ts                 (NEW)
├── services/
│   ├── git.ts                       (NEW)
│   ├── scanner.ts                   (NEW)
│   └── notifier.ts                  (NEW)
├── utils/
│   ├── docoraignore.ts              (NEW)
│   ├── crypto.ts                    (existing)
│   ├── github.ts                    (existing)
│   ├── token.ts                     (existing)
│   └── url-validator.ts             (existing)
├── workers/
│   ├── snapshot.worker.ts           (NEW)
│   └── snapshot.scheduler.ts        (NEW)
├── index.ts                         (MODIFY)
├── worker.ts                        (NEW)
└── server.ts                        (existing)

tests/
├── utils/
│   └── docoraignore.test.ts         (NEW)
├── services/
│   ├── git.test.ts                  (NEW)
│   ├── scanner.test.ts              (NEW)
│   └── notifier.test.ts             (NEW)
└── workers/
    └── snapshot.worker.test.ts      (NEW)

deploy/
├── docker-compose.yml               (MODIFY - add Redis)
└── liquibase/changelog/
    ├── db.changelog-master.yml      (MODIFY)
    └── 003-snapshot-tables.yml      (NEW)
```

---

# Docker Compose (Production)

```yaml
services:
  api:
    environment:
      - RUN_MODE=api
    # ... existing config

  worker:
    build: .
    environment:
      - RUN_MODE=worker
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgres://...
    volumes:
      - repos_data:/data/repos
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  repos_data:
  redis_data:
```

---

# Acceptance Criteria

- [ ] Redis added to docker-compose stack
- [ ] Database migrations create snapshot tables
- [ ] `app_repositories.status` tracks scanning state
- [ ] Repositories are cloned to `/data/repos/{owner}/{repo}`
- [ ] `.docoraignore` patterns are respected
- [ ] Snapshot includes full file content
- [ ] Apps receive POST with `initial_snapshot` event
- [ ] Failed notifications retry with exponential backoff
- [ ] After max retries, status = `failed`
- [ ] Plugin pipeline interface exists (passthrough)
- [ ] Worker runs independently from API server
- [ ] All tests pass

---

# Verification

1. **Setup:**
   ```bash
   docker run -d --name docora-redis -p 6379:6379 redis:7-alpine
   pnpm dev  # API mode
   pnpm worker  # Worker mode (new script)
   ```

2. **Test flow:**
   - Onboard app → get token
   - Register repository with token
   - Check `app_repositories.status` = `pending_snapshot`
   - Wait for scheduler to pick up job
   - Verify clone in `/data/repos/{owner}/{repo}`
   - Verify POST received at app's `base_url`
   - Check `app_repositories.status` = `synced`

3. **Test retry:**
   - Register repo with unreachable `base_url`
   - Verify retry attempts with increasing delays
   - After max retries, check `status` = `failed`
