# External Integrations

**Analysis Date:** 2026-01-26

## APIs & External Services

**GitHub:**
- GitHub API v3 (REST) - Repository validation and metadata retrieval
  - SDK/Client: `@octokit/rest` 22.0.1
  - Auth: GitHub token (optional, for private repos)
  - Usage: `src/utils/github.ts` - `validateRepository()` validates repo existence and accessibility
  - Rate limiting: Standard GitHub API limits apply

**Client Applications (Webhook Delivery):**
- Push-based notifications to registered apps
  - Client: axios 1.13.2
  - Authentication: HMAC-SHA256 signatures via `X-Docora-Signature` header
  - Payload signing: `src/utils/signature.ts` - Uses HMAC-SHA256(timestamp.payload, client_auth_key)
  - Endpoints: `/create`, `/update`, `/delete` on app's registered `base_url`
  - Chunked delivery: `src/services/chunked-notifier.ts` for binary files > 1MB

## Data Storage

**Databases:**
- PostgreSQL 16+
  - Connection: `DATABASE_URL` env var (jdbc style or psql URI)
  - Client: Kysely 0.28.9 (type-safe query builder)
  - Dialect: PostgresDialect with pg driver
  - Initialization: `src/db/index.ts` - Lazy initialization on first use

**File Storage:**
- Local filesystem only
  - Location: `REPOS_BASE_PATH` env var (default `/data/repos`)
  - Structure: `/data/repos/{owner}/{repo}` - Git repositories cloned locally
  - Management: `src/services/git.ts` - Clone with `simple-git` package

**Caching:**
- Redis 7+ instance
  - Connection: `REDIS_URL` env var (default `redis://localhost:6379`)
  - Client: ioredis 5.9.1
  - Usage: BullMQ job queue backend for snapshot processing
  - Configuration: `src/queue/connection.ts` - maxRetriesPerRequest: null for compatibility

## Authentication & Identity

**App Bearer Tokens:**
- Custom implementation
  - Type: Bearer token in `Authorization` header
  - Verification: `src/plugins/auth.ts` - Hashed token lookup in `apps` table
  - Hashing: bcrypt 6.0.0 (via `verifyToken()` in `src/utils/token.ts`)
  - Token generation: `generateAppToken()` returns plaintext, stored as hash
  - Storage: `token_hash` in apps table
  - Public routes: `/api/apps/onboard`, `/health`, `/version`, Swagger docs marked with `publicAccess: true`

**GitHub Token Encryption:**
- For accessing private repositories
  - Encryption: AES-256-GCM (via Node.js `crypto` module)
  - Key source: `ENCRYPTION_KEY` env var (64-char hex string = 32 bytes)
  - Format: `iv:authTag:encryptedData` (all hex encoded)
  - Usage: Encrypted in database, decrypted at job time in `src/workers/snapshot.worker.ts`

## Monitoring & Observability

**Error Tracking:**
- Not detected - errors logged to stdout via Fastify logger

**Logs:**
- Fastify built-in logger: `src/server.ts` line 16-19
  - Level: Configurable via `LOG_LEVEL` env var (default "info")
  - Output: stdout/stderr
  - Key logs: Connection events, authentication, job processing status

## CI/CD & Deployment

**Hosting:**
- Docker-based deployment
  - Image repository: ghcr.io/toto-castaldi/docora
  - Container runtime: Docker with docker-compose orchestration

**Deployment Infrastructure (`deploy/docker-compose.yml`):**
- docora-api: API server (RUN_MODE=api)
- docora-worker: Background job processor (RUN_MODE=worker)
- PostgreSQL 16-alpine: Database
- Redis 7-alpine: Queue backend
- Liquibase 4.25: Database migrations
- Caddy 2-alpine: Reverse proxy (TLS termination)

**Database Migrations:**
- Liquibase 4.25 YAML format
  - Location: `deploy/liquibase/changelog/`
  - Master file: `db.changelog-master.yml`
  - Files:
    - `001-create-apps-table.yml` - apps table schema
    - `002-create-repositories-table.yml` - repositories table
    - `003-snapshot.yml` - file snapshots storage
    - `004-app-auth-key.yml` - client_auth_key column for HMAC signing
    - `005-periodic-scanning.yml` - rescan configuration columns
    - `006-app-delivered-files.yml` - per-app delivery tracking

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection URL
- `ENCRYPTION_KEY` - 64-char hex string (32 bytes) for AES-256-GCM
- `REPOS_BASE_PATH` - Absolute path for cloned repos (e.g., `/data/repos`)
- `RUN_MODE` - "api", "worker", or "all"

**Optional env vars:**
- `PORT` - HTTP port (default 3000)
- `HOST` - Listen address (default 0.0.0.0)
- `LOG_LEVEL` - Logging level (default "info")
- `CORS_ORIGIN` - CORS allowed origins (default "*")
- `DOMAIN` - Main domain
- `API_DOMAIN` - API subdomain
- `SCAN_INTERVAL_MS` - Job scan interval (default 60000ms)
- `SCAN_CONCURRENCY` - Parallel jobs (default 5)
- `MAX_RETRY_ATTEMPTS` - Retry count for failed jobs (default 5)
- `RETRY_BASE_DELAY_MS` - Retry backoff base (default 1000ms)
- `RESCAN_INTERVAL_MS` - Periodic rescan interval (default 300000ms)
- `BINARY_CHUNK_THRESHOLD_BYTES` - Binary file threshold (default 1048576 bytes)
- `BINARY_CHUNK_SIZE_BYTES` - Chunk size (default 524288 bytes)

**Secrets location:**
- `.env` file (development)
- Environment variables (production/docker-compose)

## Webhooks & Callbacks

**Incoming:**
- POST `/api/apps/onboard` - App registration endpoint (registers callback URL)
- POST `/api/repositories` - Repository registration endpoint

**Outgoing (to client apps):**
- POST `{app.base_url}/create` - File created notification
- POST `{app.base_url}/update` - File updated notification
- POST `{app.base_url}/delete` - File deleted notification
- Payload format: `FileNotificationPayload` from `src/services/notifier.ts`
- Authentication: HMAC-SHA256 signature in `X-Docora-Signature` header
- Chunking support: Binary files > `BINARY_CHUNK_THRESHOLD_BYTES` split via `src/services/chunked-notifier.ts`

---

*Integration audit: 2026-01-26*
