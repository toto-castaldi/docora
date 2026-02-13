# Architecture

**Analysis Date:** 2026-01-26

## Pattern Overview

**Overall:** Event-driven push notification system with asynchronous job processing

**Key Characteristics:**
- Headless monitoring service that watches GitHub repositories for structural file changes
- Push-based notifications to registered client applications via granular file-level events (create/update/delete)
- Hash-based change detection without semantic validation
- Job queue pattern (BullMQ) for scalable, decoupled snapshot processing
- Circuit breaker pattern for resilient Git operations
- Per-app delivery tracking for idempotency and recovery

## Layers

**API Layer (Routes):**
- Purpose: HTTP endpoints for app registration, repository registration, health checks
- Location: `src/routes/`
- Contains: Route handlers with request validation and CORS/security middleware
- Depends on: Database repositories, authentication, URL validation, GitHub utilities
- Used by: Client applications, external callers

**Authentication Layer (Plugins):**
- Purpose: Bearer token verification for protected endpoints
- Location: `src/plugins/auth.ts`
- Contains: FastifyRequest hook for per-request auth validation
- Depends on: Database (apps table), token verification utility
- Used by: All protected routes

**Service Layer:**
- Purpose: Core business logic for git operations, file scanning, change detection, notifications
- Location: `src/services/`
- Contains: Orchestration logic for complex workflows
- Depends on: Repositories, utilities, external services (Git, HTTP)
- Used by: Workers, routes, repositories

**Repository Layer (Data Access):**
- Purpose: Isolated database CRUD operations
- Location: `src/repositories/`
- Contains: Kysely queries for apps, repositories, snapshots, deliveries
- Depends on: Database connection, encryption utilities
- Used by: Services, workers, routes

**Queue/Worker Layer:**
- Purpose: Asynchronous snapshot processing with retry and state management
- Location: `src/workers/`
- Contains: BullMQ worker for snapshot jobs and scheduler for job discovery
- Depends on: Repositories, services, Redis connection
- Used by: Scheduler (internal triggering)

**Utility Layer:**
- Purpose: Cross-cutting concerns - crypto, signatures, token generation, GitHub API
- Location: `src/utils/`
- Contains: Pure functions and adapters for external libraries
- Depends on: External libraries (axios, crypto, @octokit/rest)
- Used by: All upper layers

**Database Layer:**
- Purpose: Connection pooling and schema interface
- Location: `src/db/`
- Contains: Kysely dialect setup, TypeScript type definitions for tables
- Depends on: PostgreSQL driver (pg), environment configuration
- Used by: Repositories

**Server & Infrastructure:**
- Purpose: HTTP server setup, middleware registration, graceful shutdown
- Location: `src/server.ts`, `src/index.ts`, `src/worker.ts`
- Contains: Fastify configuration, mode-based startup (api/worker/all)
- Depends on: All other layers
- Used by: Docker/deployment

## Data Flow

**App Registration Flow:**

1. POST `/api/apps/onboard` (public)
2. `src/routes/apps/onboard.ts` validates request, checks SSRF safety
3. `src/repositories/apps.ts` inserts into `apps` table, returns `app_id` and `token`
4. Client stores `token` for future authenticated requests

**Repository Monitoring Flow (Triggered by Scheduler):**

1. `src/workers/snapshot.scheduler.ts` runs every 60s (configurable)
2. Queries `findRepositoriesForRescan()` for pending/stale/retry repos
3. Queues snapshot jobs to BullMQ with job ID = `{app_id}-{repository_id}`
4. Worker dequeues and processes: `src/workers/snapshot.worker.ts`

**Snapshot Processing (Synchronous Within Job):**

1. Decrypt GitHub token and client auth key from encrypted storage
2. `src/services/git.ts`: Clone/pull repository, get commit SHA, detect branch
3. `src/services/scanner.ts`: Recursively walk directory, compute SHA-256 for each file
4. Exclude `.git` folder, encode binary files as Base64, text as UTF-8
5. Apply plugin pipeline (currently passthrough): `src/plugins/pipeline.ts`
6. Fetch previous snapshot from `getSnapshotFileHashes()` for comparison
7. `src/services/change-detector.ts`: Compare current vs previous, detect create/update/delete
8. For each change (in order: deleted → created → updated):
   - Build notification payload with file metadata
   - Send to `{base_url}/{endpoint}` with HMAC-SHA256 signature
   - If binary and large, use chunked delivery: `src/services/chunked-notifier.ts`
   - Record delivery in `app_delivered_files` (per-app tracking)
9. If all notifications succeed, save snapshot to database and mark as synced
10. If any notification fails, throw error → BullMQ retry with exponential backoff

**State Management:**

- **App state:** `apps` table (credentials, base_url, client auth key encrypted)
- **Repository state:** `repositories` table (URL, ownership, circuit breaker status)
- **Link state:** `app_repositories` table (app-repo relationship, sync status, retry count, last error)
- **Snapshot state:** `repository_snapshots` + `snapshot_files` tables (file hashes, commit SHA, branch)
- **Delivery tracking:** `app_delivered_files` table (which files delivered to which apps)

## Key Abstractions

**SnapshotJobData:**
- Purpose: Encapsulates all data needed to process a repository snapshot
- Examples: `src/workers/snapshot.worker.ts`
- Pattern: Data object passed through queue, contains encrypted tokens

**FileChange:**
- Purpose: Represents detected file modification
- Examples: `src/services/change-detector.ts`
- Pattern: Discriminated union with type-specific fields (type: created|updated|deleted)

**ScannedFile:**
- Purpose: File with computed metadata (hash, size, encoding)
- Examples: `src/services/scanner.ts`
- Pattern: Immutable data object with SHA-256 and content encoding info

**NotificationPayload:**
- Purpose: Standardized format for file change events sent to clients
- Examples: `src/services/notifier.ts`, `buildCreatePayload()`, `buildDeletePayload()`
- Pattern: Includes repository context, file metadata, commit info, timestamp

**RepositoryInfo:**
- Purpose: Reference data for repository identifiers
- Examples: `src/services/notifier.ts`
- Pattern: Lightweight tuple of repository_id, github_url, owner, name

## Entry Points

**src/index.ts (Main Application):**
- Location: `src/index.ts`
- Triggers: Node.js process start with `node dist/index.js`
- Responsibilities: Initialize database, select run mode (api/worker/all), start server/worker, handle graceful shutdown
- Environment: `RUN_MODE=api|worker|all`, `PORT`, `HOST`

**src/server.ts (HTTP Server):**
- Location: `src/server.ts`
- Triggers: Called by `src/index.ts` when `RUN_MODE` includes api
- Responsibilities: Build Fastify instance with security (helmet, CORS), rate limiting, auth plugin, Swagger docs, register routes
- Returns: FastifyInstance configured and ready to listen

**src/worker.ts (Worker-Only Mode):**
- Location: `src/worker.ts`
- Triggers: Called by `src/index.ts` when `RUN_MODE=worker`
- Responsibilities: Initialize database, start BullMQ worker, start scheduler, handle shutdown
- Environment: Redis connection required

**src/routes/index.ts (Route Aggregator):**
- Location: `src/routes/index.ts`
- Triggers: Called by `buildServer()` during initialization
- Responsibilities: Register all route handlers (health, version, apps, repositories)

**src/workers/snapshot.scheduler.ts (Scheduler):**
- Location: `src/workers/snapshot.scheduler.ts`
- Triggers: Called by `src/index.ts` or `src/worker.ts` with `startScheduler()`
- Responsibilities: Periodically scan database for pending/stale repositories, queue snapshot jobs
- Environment: `SCAN_INTERVAL_MS=60000`, `RESCAN_INTERVAL_MS=300000`

**src/workers/snapshot.worker.ts (Job Processor):**
- Location: `src/workers/snapshot.worker.ts`
- Triggers: BullMQ dequeues snapshot jobs from queue
- Responsibilities: Clone/scan repo, detect changes, send notifications, save snapshot, handle retries
- Environment: `MAX_RETRY_ATTEMPTS=5`, `SCAN_CONCURRENCY=5`

## Error Handling

**Strategy:** Fail fast with granular retry logic per job, circuit breaker for git failures

**Patterns:**

- **Job Failures:** Any error in `processSnapshotJob()` throws → BullMQ retries with exponential backoff (1s base, 5 max attempts)
- **Git Failures:** Recorded with atomic counter → opens circuit breaker after 5 consecutive failures → pauses scans for 30 minutes
- **Notification Failures:** Any HTTP error (4xx/5xx) or network error → stops entire job immediately → triggers BullMQ retry
- **Database Errors:** Propagate up → job retry
- **Crypto/Validation:** Route-level validation with early 422/401 returns
- **Route Errors:** SSRF check, GitHub URL parsing, token validation with descriptive error messages

## Cross-Cutting Concerns

**Logging:** Console-based with structured prefixes
- Levels: debug, log, warn, error (via process.env.LOG_LEVEL)
- Prefixes: `[app_name-app_id]` for worker jobs, `[AUTH]` for auth plugin
- Includes: State transitions, file counts, error details, retry counts

**Validation:** Multi-layer approach
- Routes: Zod schemas for request/response bodies with type safety
- GitHub: URL format validation, SSRF protection via `url-validator.ts`
- GitHub API: Real-time existence check via Octokit REST API
- Database: Kysely type system enforces schema at compile time

**Authentication:** Bearer token (API) and HMAC-SHA256 signature (webhooks)
- API routes: Global hook checks Authorization header, verifies bcrypt hash against all apps
- Public routes: Marked with `publicAccess: true` config
- Webhooks: HMAC signature header generated with encrypted client auth key

**Encryption:** AES-256-GCM for sensitive data at rest
- What: GitHub tokens, client auth keys
- Where: Database tables store encrypted values
- When: Encrypted before insert, decrypted on worker job processing
- Key: From `ENCRYPTION_KEY` environment variable

**Chunking:** For large binary files exceeding threshold
- When: File size > 5MB (configurable)
- How: Split into chunks with sequential indices and total count
- Payload: Includes `chunk: { index, total, offset }` metadata

**Signatures:** HMAC-SHA256 for webhook authenticity
- Header: `X-Docora-Signature: sha256=<hex>`
- Body: JSON payload serialized deterministically
- Key: Client auth key from encrypted storage
