---
phase: 01-foundation-auth
plan: 04
subsystem: admin-dashboard
tags: [fastify-static, spa-routing, production-serving]

dependency_graph:
  requires: ["01-02", "01-03"]
  provides: ["static-file-serving", "spa-routing", "production-deployment-ready"]
  affects: ["01-05", "docker-deployment"]

tech_stack:
  added:
    - "@fastify/static@^9.0.0"
  patterns:
    - "SPA catch-all routing for non-API paths"
    - "Graceful degradation when build artifacts missing"

key_files:
  created:
    - "src/routes/admin/static.ts"
  modified:
    - "package.json"
    - "src/routes/admin/index.ts"
    - ".gitignore"

decisions:
  - id: "decorateReply-false"
    choice: "Use decorateReply: false for @fastify/static"
    reason: "Avoid conflicts with other potential static plugins"
  - id: "api-prefix-detection"
    choice: "Check url.startsWith('/admin/api/') for API routing"
    reason: "Prevent SPA catch-all from intercepting API endpoints"
  - id: "503-for-missing-build"
    choice: "Return 503 with instructions when dashboard not built"
    reason: "Clear developer experience during setup"

metrics:
  duration: "2.6 min"
  completed: "2026-01-29"
---

# Phase 01 Plan 04: Dashboard Static Serving Summary

**One-liner:** @fastify/static integration serving React dashboard at /admin/ with SPA routing and graceful error handling.

## What Was Done

1. **Installed @fastify/static** - Added static file serving capability to Fastify backend
2. **Added build scripts** - dashboard:build, dashboard:dev, build:all for monorepo workflow
3. **Created static.ts** - Static file serving with SPA catch-all routing for /admin/*
4. **Updated admin routes index** - Proper route registration order (auth before static)
5. **Added .gitignore entry** - dashboard/dist/ excluded from version control

## Key Implementation Details

### Static File Serving (src/routes/admin/static.ts)

```typescript
// Serves dashboard/dist at /admin/ prefix
await server.register(fastifyStatic, {
  root: DASHBOARD_DIST_PATH,
  prefix: "/admin/",
  decorateReply: false,
});

// SPA catch-all - serves index.html for non-API routes
server.get("/admin/*", ...)
```

### Route Registration Order

Auth routes registered BEFORE static routes to prevent SPA catch-all from intercepting `/admin/api/*` endpoints.

### Graceful Error Handling

When `dashboard/dist` doesn't exist:
```json
{
  "error": "Dashboard not built",
  "message": "Run 'pnpm dashboard:build' to build the dashboard",
  "path": "/path/to/dashboard/dist"
}
```

## Commits

| Hash | Type | Description |
|------|------|-------------|
| b889025 | chore | install @fastify/static and add dashboard build scripts |
| 758e2e6 | feat | add static file serving for dashboard SPA |
| 5ad8cb3 | chore | add dashboard/dist to .gitignore |

## Verification Results

- [x] `pnpm dashboard:build` succeeds and creates dashboard/dist/
- [x] Type check passes without errors
- [x] Auth routes preserved at /admin/api/*
- [x] SPA catch-all handles /admin/* (non-API)
- [x] dashboard/dist/ in .gitignore

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for 01-05:** Dashboard pages and API integration can now be tested with the full stack:
- `pnpm dev` for backend (serves dashboard at /admin/)
- `pnpm dashboard:dev` for frontend dev with hot reload (proxies to backend)

**Production deployment pattern:**
1. `pnpm build:all` - Compile backend TypeScript + build React dashboard
2. `pnpm start` - Single server serves API and dashboard
