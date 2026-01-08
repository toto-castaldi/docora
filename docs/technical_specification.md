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

# Database

PostgreSQL 16
Schema managed via Liquibase (YAML format)

**Tables:**
- `apps` - Registered third-party applications
- `repositories` - GitHub repositories being monitored
- `app_repositories` - Junction table (apps ↔ repositories)
- `repository_snapshots` - Last known state of repositories
- `snapshot_files` - File metadata for change detection

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
- Snapshot notifications to registered apps
- Retry with exponential backoff

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

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ENCRYPTION_KEY` | AES-256 key for token encryption |
| `REPOS_BASE_PATH` | Local path for cloned repositories |
| `RUN_MODE` | `api`, `worker`, or `all` |
