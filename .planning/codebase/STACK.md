# Technology Stack

**Analysis Date:** 2026-01-26

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code in `src/`, compiled to ES modules in `dist/`

**Secondary:**
- JavaScript (YAML configs, Dockerfile, deployment scripts)

## Runtime

**Environment:**
- Node.js 22.x (specified in `.nvmrc`)
- ES modules (ESM) with TypeScript compilation

**Package Manager:**
- pnpm 9.15.0
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Fastify 5.6.2 - HTTP server framework
- BullMQ 5.66.4 - Job queue for background processing
- Kysely 0.28.9 - SQL query builder for database access
- simple-git 3.30.0 - Git repository operations

**Testing:**
- Vitest 4.0.16 - Test runner and framework
- @vitest/coverage-v8 4.0.16 - Code coverage reporting

**Build/Dev:**
- tsx 4.21.0 - TypeScript execution with hot reload (`pnpm dev`, `pnpm worker`)
- tsc 5.9.3 - TypeScript compiler for production builds (`pnpm build`)

## Key Dependencies

**Critical:**
- @octokit/rest 22.0.1 - GitHub API client for repository validation
- pg 8.16.3 - PostgreSQL database driver
- ioredis 5.9.1 - Redis client for BullMQ queue backend
- axios 1.13.2 - HTTP client for sending notifications to registered apps
- zod 4.3.5 - Schema validation and runtime type checking
- bcrypt 6.0.0 - Password/token hashing for bearer token verification

**Security:**
- @fastify/helmet 13.0.2 - Security headers (XSS, clickjacking protection)
- @fastify/cors 11.2.0 - Cross-origin request handling
- @fastify/rate-limit 10.3.0 - Rate limiting (100 req/minute)

**API Documentation:**
- @fastify/swagger 9.6.1 - OpenAPI schema generation
- @fastify/swagger-ui 5.2.4 - Swagger UI web interface
- @asteasolutions/zod-to-openapi 8.4.0 - OpenAPI schema from Zod types
- fastify-type-provider-zod 6.1.0 - Zod validation integration

**File Processing:**
- isbinaryfile 6.0.0 - Detect binary vs text files

**Utilities:**
- dotenv 17.2.3 - Environment variable loading from `.env`
- fastify-plugin 5.1.0 - Fastify plugin wrapper

## Configuration

**Environment:**
- Loaded from `.env` file via `dotenv` at `src/index.ts` line 1
- Key configs: `DATABASE_URL`, `REDIS_URL`, `REPOS_BASE_PATH`, `ENCRYPTION_KEY`, `LOG_LEVEL`, `PORT`, `HOST`, `RUN_MODE`

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2022
- Module: NodeNext (ESM)
- Output: `./dist`
- Source: `./src`
- Strict mode enabled
- No unused locals/parameters allowed

**Build:**
- Dockerfile: Multi-stage build (builder → production)
- Builder stage: Compiles TypeScript
- Production stage: Node 22-alpine with git, production dependencies only

## Platform Requirements

**Development:**
- Node.js >= 22.0.0
- pnpm 9.15.0
- PostgreSQL 16 (for local testing)
- Redis 7 (for local testing)

**Production:**
- Node.js 22-alpine base image
- Git installed (for repository cloning)
- PostgreSQL 16+ database
- Redis 7+ instance
- Liquibase 4.25 for database migrations

---

*Stack analysis: 2026-01-26*
