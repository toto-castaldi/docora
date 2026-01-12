technical specification
=======================

# tools

```bash
> pnpm --version
9.15.0

> node --version
v22.20.0
```

# API Endpoints

| Method | Path | Description | Auth | Response |
|--------|------|-------------|------|----------|
| GET | `/health` | Health status | No | `{ "status": "healthy", "timestamp": "...", "uptime": 123 }` |
| GET | `/version` | Version info | No | `{ "version": "v0.0.0", "full": "...", "details": {...} }` |
| POST | `/api/apps/onboard` | Register third-party app | No | `{ "app_id": "...", "token": "...", "created_at": "..." }` |
| POST | `/api/repositories` | Register GitHub repository | Bearer | `{ "repository_id": "...", "github_url": "...", ... }` |
| DELETE | `/api/repositories/{repository_id}` | Unwatch repository | Bearer | `204 No Content` |
| GET | `/docs` | Swagger UI | No | OpenAPI documentation |

# Technology Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript |
| Runtime | Node.js 22 |
| Framework | Fastify |
| Package Manager | pnpm |
| Testing | Vitest |
| Database | PostgreSQL 16 |
| Migrations | Liquibase (YAML) |
| Query Builder | Kysely |
| Validation | Zod |
| API Docs | zod-openapi + @fastify/swagger |
| Job Queue | BullMQ |
| Redis Client | ioredis |
| Git Operations | simple-git |
| GitHub API | @octokit/rest |
| Containerization | Docker |
| Reverse Proxy | Caddy (auto HTTPS) |

# Versioning System

Follows the strategy defined in `versioning.md`:

- **Single source of truth**: `src/version.ts`
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, etc.
- **Auto-release**: GitHub Actions analyzes commits and bumps version
- **Semantic Versioning**: `feat` → MINOR, `fix` → PATCH, `!` → MAJOR

# Docker

In prod Docora is running with a Docker Compose stack.
In dev all needed services are executed by a single container.

## Production Image

The Dockerfile uses a multi-stage build:

1. **Builder stage**: Compiles TypeScript
2. **Production stage**:
   - Base: `node:22-alpine`
   - Installs `git` for repository cloning
   - Creates `/data/repos` with `node:node` ownership
   - Runs as non-root `node` user

## Volumes

The worker container requires a persistent volume for cloned repositories:

```yaml
docora-worker:
  volumes:
    - repos_data:/data/repos
```

**Important:** If the worker fails with `EACCES: permission denied`, fix with:
```bash
docker exec -u root docora-worker chown -R node:node /data
```

# Database

PostgreSQL 16
Schema managed via Liquibase (YAML format)

**Tables:**
- `apps` - Registered third-party applications
- `repositories` - GitHub repositories being monitored
- `app_repositories` - Junction table (apps ↔ repositories)
- `repository_snapshots` - Last known state of repositories
- `snapshot_files` - File metadata for change detection
- `app_delivered_files` - Per-app delivery tracking for multi-app consistency

# Worker

Docora runs in two modes controlled by `RUN_MODE` environment variable:

| Mode | Description | Command |
|------|-------------|---------|
| `api` | API server only | `pnpm dev` |
| `worker` | Background worker only | `pnpm worker` |
| `all` | Both API and worker | `RUN_MODE=all pnpm dev` |

The worker handles:
- Repository cloning/pulling
- File scanning with `.docoraignore` support
- Binary file detection and Base64 encoding
- Snapshot notifications to registered apps (with chunking for large files)
- Unified error handling: any non-2xx response triggers job retry
- Retry with exponential backoff until `MAX_RETRY_ATTEMPTS`
- Periodic re-scanning of synced repositories
- Circuit breaker for git failures (auto-reset on repository re-registration)

# docoraignore

Example .docoraignore File

```
# Dependencies
node_modules/

# Build output
dist/
build/

# Environment files
.env
.env.*

# Logs
*.log

# IDE
.vscode/
.idea/
```

# Environment Variables

See `.env.example` for all configuration options:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `ENCRYPTION_KEY` | - | AES-256 key for token encryption |
| `REPOS_BASE_PATH` | `/data/repos` | Local path for cloned repositories (**must be absolute path**) |
| `RUN_MODE` | `all` | `api`, `worker`, or `all` |
| `SCAN_INTERVAL_MS` | `60000` | Scheduler polling interval (ms) |
| `SCAN_CONCURRENCY` | `5` | Max concurrent workers |
| `MAX_RETRY_ATTEMPTS` | `5` | Per-job BullMQ retries |
| `RETRY_BASE_DELAY_MS` | `1000` | Backoff base delay (ms) |
| `RESCAN_INTERVAL_MS` | `300000` | How often to rescan synced repos (ms) |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Consecutive git failures before opening circuit |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `1800000` | How long circuit stays open (ms) |
| `BINARY_CHUNK_THRESHOLD_BYTES` | `1048576` | Files above this size are chunked (1MB) |
| `BINARY_CHUNK_SIZE_BYTES` | `524288` | Size of each chunk (512KB) |

# Authentication Flow

## App → Docora (API calls)

Apps authenticate to Docora using a Bearer token issued during onboarding.

```
POST /api/repositories
Authorization: Bearer {app_token}
```

The `app_token` is returned once during onboarding and stored as a bcrypt hash in Docora's database.

## Docora → App (Webhooks)

When Docora sends notifications to apps, it uses HMAC signature authentication.

### client_auth_key

During onboarding, the app provides a `client_auth_key` which is:
- Generated by the app before onboarding
- Sent to Docora during `POST /api/apps/onboard`
- Stored encrypted (AES-256) in the `apps.client_auth_key_encrypted` column
- Used to compute HMAC signatures (NEVER transmitted after onboarding)

### HMAC Signature Authentication

Every webhook request includes these headers:

```
X-Docora-App-Id: {app_id}
X-Docora-Signature: sha256={hmac_signature}
X-Docora-Timestamp: {unix_timestamp}
```

**Why HMAC instead of Bearer token?**
- Bearer tokens expose the secret in every request
- If a webhook is intercepted, attacker gets the secret and can forge requests
- With HMAC, the secret is NEVER transmitted after onboarding
- Each signature is unique to the payload, preventing replay attacks

### Signature Computation

```
payload = timestamp + "." + JSON.stringify(body)
signature = HMAC-SHA256(payload, client_auth_key)
```

### Verification Steps (Client Side)

1. Verify `X-Docora-App-Id` matches expected app
2. Verify `X-Docora-Timestamp` is within 5 minutes of current time
3. Recompute signature using stored `client_auth_key`
4. Compare signatures using constant-time comparison

# Binary File Support

Docora supports binary files (images, PDFs, videos, etc.) in webhook notifications.

## Detection

Binary files are automatically detected using the `isbinaryfile` package.

## Encoding

- **Text files**: Content sent as plain UTF-8 string (backward compatible)
- **Binary files**: Content encoded as Base64, with `content_encoding: "base64"`

## Chunking

Large binary files are split into chunks to handle memory and payload limits:

- Files above `BINARY_CHUNK_THRESHOLD_BYTES` (default 1MB) are chunked
- Each chunk is `BINARY_CHUNK_SIZE_BYTES` (default 512KB)
- Chunks are sent sequentially, waiting for 2xx before next chunk

## Payload Example (Binary with Chunking)

```json
{
  "repository": { ... },
  "file": {
    "path": "assets/video.mp4",
    "sha": "abc123...",
    "size": 5242880,
    "content": "<base64 chunk>",
    "content_encoding": "base64",
    "chunk": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "index": 0,
      "total": 10
    }
  },
  "commit_sha": "...",
  "timestamp": "..."
}
```

## Client Reassembly

Clients must reassemble chunked files:

1. Buffer chunks by `chunk.id`
2. When all chunks received, concatenate `content` strings
3. Decode concatenated Base64 to binary
4. Recommended timeout for incomplete transfers: 5 minutes

# Notification Error Handling

Docora uses a unified error handling strategy for webhook notifications:

```
┌───────────────┬─────────────────────────────────────────┐
│    Status     │                 Action                  │
├───────────────┼─────────────────────────────────────────┤
│ 2xx           │ Success, continue to next file          │
├───────────────┼─────────────────────────────────────────┤
│ Any error     │ Stop immediately, retry entire job      │
│ (4xx/5xx/net) │ with backoff until MAX_RETRY_ATTEMPTS   │
└───────────────┴─────────────────────────────────────────┘
```

**Behavior:**
- Any non-2xx response (including 4xx client errors) triggers job retry
- On failure, the entire job is retried from the beginning
- Files may be re-sent on retry (clients must be idempotent)
- `retry_count` resets only when the entire job completes successfully
- After `MAX_RETRY_ATTEMPTS`, the repository status is marked as `failed`

# Per-App Delivery Tracking

When multiple apps monitor the same repository, each app maintains its own delivery state. This ensures that if one app fails to receive notifications, it doesn't affect other apps.

## How It Works

1. Each successful file delivery is recorded in `app_delivered_files` table
2. Change detection compares current repo state against what each app has received
3. Operations (CREATE/UPDATE/DELETE) are determined from the app's perspective

## Multi-App Scenario

```
Repository X → App A (receives all files)
            → App B (fails mid-delivery)

App A: knows about file1.txt, file2.txt, file3.txt
App B: knows about file1.txt only (file2 failed)

On retry:
- App A: detects only new changes since last sync
- App B: receives file2.txt, file3.txt (what it missed)
```

## Design Philosophy

**"Current state wins"**: Apps receive the latest file content, not historical versions.

| App knows | Repo has | Operation |
|-----------|----------|-----------|
| (nothing) | file.txt: sha_v2 | CREATE |
| file.txt: sha_v1 | file.txt: sha_v2 | UPDATE |
| file.txt: sha_v1 | (deleted) | DELETE |
| file.txt: sha_v1 | file.txt: sha_v1 | (none) |
