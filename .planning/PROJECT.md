# Docora Admin Dashboard

## What This Is

An admin monitoring dashboard for Docora, the headless GitHub repository monitoring service. Allows the administrator to proactively monitor system health, view failed notifications, retry deliveries, and track registered apps and their repositories — instead of discovering problems only when clients complain.

## Core Value

**See failures before clients report them, and fix them with one click.**

## Requirements

### Validated

<!-- Existing Docora capabilities (already working) -->

- ✓ App registration with bearer token authentication — existing
- ✓ Repository registration and linking to apps — existing
- ✓ GitHub repository monitoring (clone/pull) — existing
- ✓ File change detection via SHA-256 hashing — existing
- ✓ Push notifications to client apps (create/update/delete events) — existing
- ✓ Chunked delivery for large binary files — existing
- ✓ Per-app delivery tracking for idempotency — existing
- ✓ Circuit breaker for Git operation failures — existing
- ✓ BullMQ job queue for async snapshot processing — existing
- ✓ Multi-worker support — existing

### Active

<!-- Dashboard features to build -->

- [ ] Admin can log in with username/password
- [ ] Admin can view failed notifications with error details
- [ ] Admin can retry failed notifications
- [ ] Admin can view job queue status (pending count, running count)
- [ ] Admin can view list of registered apps
- [ ] Admin can view repositories monitored by each app
- [ ] Admin can view history of sent updates
- [ ] Dashboard is protected behind authentication

### Out of Scope

- Client-facing dashboard — this is admin-only for now
- OAuth/SSO authentication — simple username/password is sufficient
- Real-time WebSocket updates — polling/refresh is fine for v1
- Mobile app — web dashboard only
- Multi-admin support — single admin account for now

## Context

**Problem being solved:** Currently, failures are discovered reactively when clients complain they didn't receive updates. Admin has to dig through worker logs manually to investigate. This is time-consuming and creates a poor experience for clients.

**Technical environment:**
- Docora backend: Fastify + TypeScript + PostgreSQL + Redis/BullMQ
- Dashboard: React frontend in monorepo (`dashboard/` folder)
- Will need new API endpoints for dashboard data
- Admin auth separate from existing app bearer token auth

**Codebase state:**
- Existing API routes in `src/routes/`
- Data access via Kysely in `src/repositories/`
- BullMQ queue in `src/workers/`
- See `.planning/codebase/` for full analysis

## Constraints

- **Tech stack**: React for frontend (developer familiarity)
- **Architecture**: Monorepo — dashboard lives inside Docora repo
- **Auth**: Simple username/password, not OAuth
- **Deployment**: Dashboard served alongside API

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React frontend | Developer knows React | — Pending |
| Monorepo structure | Simpler deployment, shared types | — Pending |
| Simple admin auth | Only one admin needed, no complexity | — Pending |
| Polling over WebSocket | Simpler for v1, can add later | — Pending |

---
*Last updated: 2026-01-26 after initialization*
