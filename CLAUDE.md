# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Docora is a headless service that monitors GitHub repositories, detects structural file changes, applies optional transformation plugins, and notifies registered client applications via push-based API. It treats repositories as collections of files/directories using hash-based change detection without semantic validation.

## Development Commands

```bash
pnpm dev          # Start dev server with hot reload (tsx watch)
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled production build
pnpm test         # Run tests once
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # Type check without emitting
pnpm worker       # Start worker with hot reload
pnpm worker:start # Run compiled worker
```

## Architecture

**Entry Points:**
- `src/index.ts` - Application entry point, loads dotenv, starts server and/or worker based on `RUN_MODE`
- `src/worker.ts` - Worker entry point for background job processing
- `src/server.ts` - Fastify server builder with CORS/Helmet/Swagger middleware

**Routes:**
- `src/routes/index.ts` - Route aggregator that registers all route modules
- `src/routes/health.ts` - GET `/health` endpoint (timestamp, uptime)
- `src/routes/version.ts` - GET `/version` endpoint (version info, build details)
- `src/routes/apps/onboard.ts` - POST `/api/apps/onboard` (app registration)
- `src/routes/repositories/register.ts` - POST `/api/repositories` (repo registration)

**Database Layer:**
- `src/db/index.ts` - Kysely connection pool, getDatabase(), closeDatabase()
- `src/db/types/` - TypeScript interfaces for database tables

**Repositories (Data Access):**
- `src/repositories/apps.ts` - App CRUD operations
- `src/repositories/repositories.ts` - Repository CRUD operations
- `src/repositories/snapshots.ts` - Snapshot storage and retrieval

**Services:**
- `src/services/git.ts` - Clone/pull repositories, get commit SHA
- `src/services/scanner.ts` - Walk filesystem, compute file hashes
- `src/services/notifier.ts` - POST snapshots to app endpoints

**Workers (BullMQ):**
- `src/workers/snapshot.scheduler.ts` - Schedules pending snapshot jobs
- `src/workers/snapshot.worker.ts` - Processes snapshot jobs

**Plugins:**
- `src/plugins/auth.ts` - Bearer token authentication middleware
- `src/plugins/swagger.ts` - OpenAPI/Swagger configuration
- `src/plugins/pipeline.ts` - Plugin pipeline interface (hook for transformations)

**Utilities:**
- `src/utils/token.ts` - Generate app IDs and tokens
- `src/utils/crypto.ts` - AES-256 encryption for GitHub tokens
- `src/utils/github.ts` - Parse GitHub URLs, validate repos via API
- `src/utils/url-validator.ts` - SSRF protection
- `src/utils/docoraignore.ts` - Parse .docoraignore patterns

**Queue:**
- `src/queue/connection.ts` - Redis/ioredis connection for BullMQ

**Version Management:**
- `src/version.ts` - Single source of truth for version. Updated automatically by CI auto-release - do not edit manually.

## Conventions

**ES Modules with TypeScript:** Imports require `.js` extension even for `.ts` source files (e.g., `import { foo } from "./bar.js"`). TypeScript compiles to ESM output.

**Conventional Commits:** All commits must follow the format:
- `feat: ...` - New feature (bumps MINOR)
- `fix: ...` - Bug fix (bumps PATCH)
- `feat!:` or `fix!:` - Breaking change (bumps MAJOR)
- `docs:`, `style:`, `refactor:`, `test:`, `chore:` - No version bump

Husky + commitlint enforce this on commit.

**Auto-Release:** Pushes to `main` trigger automatic version bumping and deployment via GitHub Actions.

## Rules

- **our names** Refer to me as "Toto", I call you "Claude"
- **Do not do any git command** Git operations are made by de developer. You can't do any of those.
- **The human does the stuff except for documentation** In this project all the implementation will be made by the human, not you. You are the perfect guide telling me how to do things, help me to understande solutions and technologies. Your plan mode is always welcome to decide what to do and in which sequence.
Manipulation of the documentation (create and update) are allowed to you.
- **sql migration as yml liquibase** Database migrations must be provided as a yml file (not sql or xml...)
- **documentation in sync** take the documentation always updated
