Infrastructure Setup
====================

> **STATUS: COMPLETED** - Implemented in v1.0.0

# Goal

Establish a production-ready foundation: a cloud-hosted TypeScript REST API with automated CI/CD, returning "hello world".

# Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript |
| Runtime | Node.js 20 |
| Framework | Fastify |
| Package Manager | pnpm |
| Testing | Vitest |
| Containerization | Docker |
| Reverse Proxy | Caddy (auto HTTPS) |
| CI/CD | GitHub Actions |
| Hosting | DigitalOcean |
| Domain | docora.toto-castaldi.com |

---

# Project Structure

```
docora/
├── .github/
│   └── workflows/
│       └── ci-deploy.yml              # Unified CI/CD pipeline
├── .husky/
│   ├── commit-msg                     # Conventional commit validation
│   └── pre-commit                     # Pre-commit type checking
├── deploy/
│   ├── docker-compose.yml             # Production deployment
│   ├── docker-compose.dev.yml         # Development (external services)
│   └── caddy/
│       └── Caddyfile                  # Reverse proxy config
├── docs/
│   ├── docora_project_documentation.md
│   ├── roadmap.md
│   └── versioning.md
├── src/
│   ├── index.ts                       # Application entry point
│   ├── server.ts                      # Fastify server configuration
│   ├── version.ts                     # Version management (source of truth)
│   └── routes/
│       ├── index.ts                   # Route aggregator
│       ├── health.ts                  # Health check endpoints
│       ├── version.route.ts           # Version endpoint
│       └── hello.ts                   # Hello world endpoint
├── tests/
│   ├── setup.ts                       # Test configuration
│   ├── health.test.ts                 # Health endpoint tests
│   ├── version.test.ts                # Version endpoint tests
│   └── hello.test.ts                  # Hello endpoint tests
├── .dockerignore
├── .env.example
├── .gitignore
├── .nvmrc
├── .release-please-manifest.json
├── commitlint.config.js
├── Dockerfile
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

# Implementation Phases

## Phase 1: Project Initialization

**Objective**: Establish the pnpm project with TypeScript tooling.

| Step | Task | File |
|------|------|------|
| 1.1 | Initialize pnpm project | `package.json` |
| 1.2 | Install production dependencies | fastify, @fastify/cors, @fastify/helmet, dotenv |
| 1.3 | Install dev dependencies | typescript, tsx, @types/node, vitest, husky, commitlint |
| 1.4 | Configure TypeScript | `tsconfig.json` |
| 1.5 | Specify Node version | `.nvmrc` |

## Phase 2: Fastify Application

**Objective**: Create the API server with required endpoints.

| Step | Task | File |
|------|------|------|
| 2.1 | Create server configuration | `src/server.ts` |
| 2.2 | Create entry point | `src/index.ts` |
| 2.3 | Create route aggregator | `src/routes/index.ts` |
| 2.4 | Create health endpoints | `src/routes/health.ts` |
| 2.5 | Create version endpoint | `src/routes/version.ts` |

## Phase 3: Testing Infrastructure

**Objective**: Set up Vitest with endpoint tests.

| Step | Task | File |
|------|------|------|
| 3.1 | Configure Vitest | `vitest.config.ts` |
| 3.2 | Create test setup | `tests/setup.ts` |
| 3.3 | Create health tests | `tests/health.test.ts` |
| 3.4 | Verify all tests pass | - |

## Phase 4: Commit Validation

**Objective**: Enforce Conventional Commits with Husky + Commitlint.

| Step | Task | File |
|------|------|------|
| 4.1 | Configure commitlint | `commitlint.config.js` |
| 4.2 | Initialize Husky | `.husky/` |
| 4.3 | Create commit-msg hook | `.husky/commit-msg` |
| 4.4 | Create pre-commit hook | `.husky/pre-commit` |

## Phase 5: Docker Configuration

**Objective**: Create production-ready containerization.

| Step | Task | File |
|------|------|------|
| 5.1 | Create Dockerfile | `Dockerfile` |
| 5.2 | Create Docker ignore | `.dockerignore` |
| 5.3 | Create production compose | `deploy/docker-compose.yml` |
| 5.4 | Create Caddy config | `deploy/caddy/Caddyfile` |

## Phase 6: CI/CD Pipeline

**Objective**: Automated build, test, versioning, and deployment.

| Step | Task | File |
|------|------|------|
| 6.1 | Create GitHub Actions workflow | `.github/workflows/ci-deploy.yml` |
| 6.2 | Create release manifest | `.release-please-manifest.json` |

**CI/CD Pipeline Flow:**

```
Push to main
    │
    ├─► Build & Test
    │       │
    │       ▼
    ├─► Auto-Release (analyze commits, bump version, create tag)
    │       │
    │       ▼
    ├─► Build Docker Image (push to GHCR)
    │       │
    │       ▼
    └─► Deploy to DigitalOcean (SSH + docker compose)
```

## Phase 7: Final Configuration

**Objective**: Complete project setup.

| Step | Task | File |
|------|------|------|
| 7.1 | Create environment template | `.env.example` |

