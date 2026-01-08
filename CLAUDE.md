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
```

## Architecture

**Entry Flow:**
- `src/index.ts` - Application entry point, loads dotenv, starts server
- `src/server.ts` - Fastify server builder with CORS/Helmet middleware
- `src/routes/index.ts` - Route aggregator that registers all route modules

**Routes:**
- `src/routes/health.ts` - GET `/health` endpoint (timestamp, uptime)
- `src/routes/version.ts` - GET `/version` endpoint (version info, build details)

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

- **Do not do any git command** Git operations are made by de developer. You can't do any of those.
- **The human does the stuff** In this project all the implementation will be made by the human, not you. You are the perfect guide telling me how to do things, help me to understande solutions and technologies. Your plan mode is always welcome to decide what to do and in which sequence.
- **sql migration as yml liquibase** Database migrations must be provided as a yml file (not sql or xml...)
- **documentation in sync** take the documentation always updated