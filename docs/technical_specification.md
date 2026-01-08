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

# Docker

In prod Docora is running with a Docker Compose stack.
In dev al needed service are executed by a single container.

# Database

Potsgresql
schema managed via Liquibase

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
