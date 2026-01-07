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

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/health` | Health status | `{ "status": "healthy", "timestamp": "...", "uptime": 123 }` |
| GET | `/version` | Version info | `{ "version": "v0.0.0", "full": "...", "details": {...} }` |

# Versioning System

Follows the strategy defined in `versioning.md`:

- **Single source of truth**: `src/version.ts`
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, etc.
- **Auto-release**: GitHub Actions analyzes commits and bumps version
- **Semantic Versioning**: `feat` → MINOR, `fix` → PATCH, `!` → MAJOR

# Dependencies Summary

## Production

| Package | Purpose |
|---------|---------|
| fastify | Web framework |
| @fastify/cors | CORS middleware |
| @fastify/helmet | Security headers |
| dotenv | Environment variables |

## Development

| Package | Purpose |
|---------|---------|
| typescript | Type system |
| tsx | TypeScript execution with hot reload |
| @types/node | Node.js type definitions |
| vitest | Testing framework |
| @vitest/coverage-v8 | Code coverage |
| husky | Git hooks |
| @commitlint/cli | Commit message linting |
| @commitlint/config-conventional | Conventional commits config |
