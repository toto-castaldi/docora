# Docora Admin Dashboard

## What This Is

An admin monitoring dashboard for Docora, the headless GitHub repository monitoring service. Provides proactive system health monitoring with full visibility into apps, repositories, notifications, and job queues — plus one-click retry and recovery operations — so administrators can see and fix failures before clients report them.

## Core Value

**See failures before clients report them, and fix them with one click.**

## Requirements

### Validated

<!-- Existing Docora capabilities -->

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

<!-- v1.0 Dashboard features -->

- ✓ DASH-01: Admin can log in with username/password — v1.0
- ✓ DASH-02: Admin can view failed notifications with error details — v1.0
- ✓ DASH-03: Admin can retry failed notifications — v1.0
- ✓ DASH-04: Admin can view job queue status (pending count, running count) — v1.0
- ✓ DASH-05: Admin can view list of registered apps — v1.0
- ✓ DASH-06: Admin can view repositories monitored by each app — v1.0
- ✓ DASH-07: Admin can view history of sent updates — v1.0 (failed notifications only, full delivery history deferred)
- ✓ DASH-08: Dashboard is protected behind authentication — v1.0

### Active

(No active requirements — define next milestone with `/gsd:new-milestone`)

### Out of Scope

- Client-facing dashboard — admin-only for now
- OAuth/SSO authentication — simple username/password is sufficient
- Real-time WebSocket updates — polling works well for admin use case
- Mobile app — web dashboard only
- Multi-admin support — single admin account for now
- Full notification delivery history/audit log — requires new table, high cost
- Email/Slack alerting — proactive notification deferred
- Multi-user admin with RBAC — overkill for single-developer use case

## Context

**Current state:** v1.0 shipped (2026-02-13). Dashboard fully operational with 5 phases, 25 plans executed in 1.52 hours.

**Codebase:**
- ~7,094 LOC total (4,631 frontend React/TypeScript + 2,463 backend TypeScript)
- Tech stack: Fastify + TypeScript + PostgreSQL + Redis/BullMQ + React + TanStack Query
- Monorepo: `dashboard/` (React frontend), `packages/shared-types/` (shared TypeScript types)
- Admin auth: session-based with Redis store, isolated from client bearer token auth
- Docker: multi-stage build includes dashboard assets

**Known tech debt:**
- DASH-07 partial implementation (failed notifications only, not full delivery history)
- 6 runtime behaviors need human verification (CSP, rate limiting, error boundary, Docker build)
- Test coverage on existing client API routes could be improved

## Constraints

- **Tech stack**: React for frontend (developer familiarity)
- **Architecture**: Monorepo — dashboard lives inside Docora repo
- **Auth**: Simple username/password, not OAuth
- **Deployment**: Dashboard served alongside API via Fastify static file serving

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React frontend | Developer knows React | ✓ Good — v1.0 |
| Monorepo structure | Simpler deployment, shared types | ✓ Good — v1.0 |
| Simple admin auth | Only one admin needed, no complexity | ✓ Good — v1.0 |
| Polling over WebSocket | Simpler for v1, can add later | ✓ Good — v1.0 |
| 5-phase roadmap | Standard depth, covers all requirements | ✓ Good — v1.0 |
| Custom IoRedisSessionStore | connect-redis requires node-redis, not ioredis | ✓ Good — v1.0 |
| Redis hashes for bulk progress | TTL auto-cleanup, no DB migrations needed | ✓ Good — v1.0 |
| Native HTML dialog for confirmations | Zero-dependency, replaces window.confirm | ✓ Good — v1.0 |
| Server-side pagination with sort whitelists | Prevents SQL injection, consistent API | ✓ Good — v1.0 |
| Single ErrorBoundary with route-based reset | Simple, resets on navigation | ✓ Good — v1.0 |

---
*Last updated: 2026-02-13 after v1.0 milestone*
