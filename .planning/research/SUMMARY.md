# Project Research Summary

**Project:** Admin Monitoring Dashboard for Docora
**Domain:** React Admin Dashboard for Fastify/TypeScript Backend (Monorepo)
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

Docora needs an admin dashboard to monitor webhook delivery, job queues, and system health. The recommended approach is a **custom React 19 + shadcn/ui dashboard** served via `@fastify/static` from the existing Fastify backend, structured as a **pnpm monorepo**. This approach avoids framework lock-in while leveraging modern tooling (Vite 6, Tailwind 4, TanStack Query).

The dashboard solves a focused problem: "see failures before clients complain, fix with one click." Research shows most admin dashboards fail from over-engineering (heavyweight frameworks, real-time everything, complex RBAC) or under-engineering security (localStorage tokens, mixed auth systems). The recommended stack balances power and simplicity — use standard patterns where they exist (session auth, polling, paginated lists) and custom components only where needed.

**Critical success factors:** Isolate admin routes from client API (separate auth plugin, route prefix), establish monorepo structure correctly upfront (shared types package), and avoid real-time polling antipatterns (5+ second intervals, React Query caching). Breaking the existing client API or exposing internal data are the highest risks.

## Key Findings

### Recommended Stack

Use **Vite + React 19 + shadcn/ui + TanStack Query/Table** within a pnpm workspace monorepo. This stack aligns with Docora's existing TypeScript/pnpm setup and provides type-safe, modern tooling without vendor lock-in.

**Core technologies:**
- **React 19.2** + **Vite 6** — Modern UI with fast builds (5x faster than CRA), industry standard
- **shadcn/ui** + **Tailwind 4** — Headless components you own, CSS-first config with Oxide engine (100x faster)
- **TanStack Query 5** — De facto standard for async data, auto-caching, background refresh
- **TanStack Table 8** — Headless tables for job/error lists with sorting/filtering
- **@fastify/static 8** — Serve dashboard build from /admin, compatible with Fastify 5.x

**Critical versions:**
- React 19.2.3 (Dec 2025) with Activity component for performance
- Vite 6.x with native Tailwind 4 plugin support
- Zod 4.x (already in Docora) for shared schema validation

**Avoid:** react-admin/Refine (overkill for single-admin monitoring), Material-UI (bundle bloat), Create React App (deprecated), plain Redux (boilerplate-heavy).

### Expected Features

Research shows admin dashboards succeed when focused on operational needs, not aspirational "enterprise" features.

**Must have (table stakes):**
- View failed notifications with error details — core problem to solve
- Retry failed notifications — useless to see failures if you can't fix them
- View job queue status (BullMQ counts) — is the system healthy?
- View registered apps and their repositories — understand what's monitored
- Basic authentication — protect the dashboard

**Should have (competitive):**
- Bulk retry all failed — efficiency when multiple failures occur
- Circuit breaker visibility — see which repos have Git issues paused
- Force full re-sync — recover from edge cases
- Filter/search apps and repos — quality of life as lists grow

**Defer (v2+):**
- Notification history/audit log — requires new table, high implementation cost
- Real-time WebSocket updates — polling every 5-10s is sufficient for single admin
- Multi-user admin with RBAC — overkill for single-developer use case
- Email/Slack alerts — proactive notification deferred until needed

**Differentiation:** Unlike generic job queue dashboards (Bull-Board, Taskforce), this is Docora-specific and understands business-level semantics (apps, repositories, delivery status), not just queue internals.

### Architecture Approach

**Monorepo with isolated admin routes.** Use pnpm workspaces to share types between backend and dashboard while keeping concerns separated. Serve dashboard via @fastify/static with SPA fallback, but use distinct authentication for admin vs client API.

**Major components:**
1. **dashboard/ package** — React app built with Vite, served from /admin
2. **packages/shared-types/** — Shared TypeScript interfaces for API contracts
3. **src/routes/admin/** — Admin-specific API endpoints (/admin/api/*) with session auth
4. **src/plugins/admin-auth.ts** — Separate auth plugin using httpOnly session cookies
5. **src/plugins/dashboard.ts** — @fastify/static configuration with SPA fallback

**Key patterns:**
- **Separate auth systems:** Apps use Bearer tokens, admins use session cookies — never mix
- **SPA fallback:** Configure setNotFoundHandler to serve index.html for client routes
- **DTO layer:** Never return raw database/queue data, transform through DTOs
- **Build order:** shared-types → dashboard build → backend build → Docker image

**Integration:** Reuse existing Kysely DB connection, BullMQ queue, Octokit client. Admin queries extend existing repositories but return admin-specific DTOs.

### Critical Pitfalls

Research identified seven critical pitfalls specific to adding admin dashboards to existing APIs:

1. **Mixing admin routes with client API authentication** — Global onRequest hook conflicts. **Avoid:** Use separate /admin/* route prefix with dedicated auth plugin, leverage Fastify encapsulation.

2. **Exposing internal data without proper isolation** — Internal endpoints discovered/accessed by external clients. **Avoid:** Separate route prefix (/admin/api/*), defense in depth (auth + IP allowlist + restricted CORS), always transform through DTOs.

3. **Frontend-backend module system mismatch** — ESM path resolution differs between TypeScript backend and Vite. **Avoid:** No imports from backend source, dedicated packages/shared-types with proper dual-export, test type sharing early.

4. **Serving SPA from Fastify without proper routing** — Page refresh returns 404 on client routes. **Avoid:** Configure setNotFoundHandler for SPA fallback, test navigation AND refresh for all routes.

5. **Real-time dashboard updates causing performance issues** — Aggressive polling hammers database/Redis. **Avoid:** Reasonable intervals (5-10s), React Query for caching/deduplication, batch state updates.

6. **Admin auth stored insecurely in frontend** — localStorage vulnerable to XSS. **Avoid:** Use httpOnly session cookies, implement CSP headers, never store long-lived tokens in browser.

7. **Breaking existing client API while adding admin features** — Shared infrastructure changes ripple unexpectedly. **Avoid:** Maintain comprehensive API tests before starting, run full suite after every admin change, use feature flags.

## Implications for Roadmap

Based on research, suggested phase structure prioritizes foundation before features:

### Phase 0: Pre-work (No Implementation)
**Rationale:** Must ensure existing client API has adequate test coverage before making any changes. Research shows breaking client API is the highest-cost pitfall.
**Delivers:** Confidence that admin work won't break existing integrations
**Validates:** Test coverage >80% for /api/apps and /api/repositories routes
**Avoids:** Pitfall #7 (breaking client API), Pitfall #2 (exposing internal data)

### Phase 1: Foundation & Authentication
**Rationale:** Architecture research shows mixed auth systems and module mismatches cause cascading failures. Must isolate admin routes and establish monorepo structure before building features.
**Delivers:**
- pnpm workspace structure (dashboard/, packages/shared-types/)
- Admin session authentication with httpOnly cookies
- Isolated /admin/api/* routes with separate auth plugin
- Type-sharing working between backend and frontend
**Addresses:** Authentication feature (must-have)
**Avoids:** Pitfall #1 (mixed auth), #3 (module mismatch), #6 (insecure token storage)
**Tech:** @fastify/session, @fastify/cookie, pnpm workspaces

### Phase 2: Dashboard Integration & Core Display
**Rationale:** With foundation in place, integrate static serving and build core read-only views. Establishes data flow patterns before adding write operations.
**Delivers:**
- @fastify/static serving dashboard/dist with SPA fallback
- View registered apps and repositories (table stakes)
- View delivery status with error details (table stakes)
- View job queue counts via BullMQ API (table stakes)
**Addresses:** View apps, view repos, view failed notifications, view queue status
**Avoids:** Pitfall #4 (SPA routing), #5 (real-time performance)
**Tech:** @fastify/static, TanStack Query, shadcn/ui data-table

### Phase 3: Retry Operations & Actions
**Rationale:** Once display works, add write operations. Start with single retry (simple), then bulk (efficiency).
**Delivers:**
- Retry individual failed notifications (table stakes)
- Bulk retry all failed (should-have)
- Force full re-sync (should-have)
**Addresses:** Core operational need to fix failures
**Avoids:** Pitfall #7 (breaking client API with status updates)
**Tech:** Optimistic updates with TanStack Query mutations

### Phase 4: Enhanced Visibility
**Rationale:** With core workflow working, add quality-of-life features for managing larger datasets.
**Delivers:**
- Filter/search apps and repositories (should-have)
- Circuit breaker status visibility (should-have)
- Retry count display (should-have)
**Addresses:** Usability as the system grows
**Avoids:** Performance pitfalls with filtering large datasets

### Phase 5: Production Hardening
**Rationale:** Dashboard works but needs production-readiness improvements.
**Delivers:**
- Comprehensive error handling and loading states
- CSP headers for XSS protection
- Rate limiting on admin endpoints
- Docker multi-stage build optimization
**Addresses:** Security and UX pitfalls from research
**Avoids:** "Looks done but isn't" checklist items

### Phase Ordering Rationale

- **Foundation first:** Architecture research shows module/auth issues require upfront resolution. Cannot build features on broken foundation.
- **Read before write:** Feature research shows display is table stakes, actions are value-add. Establish data patterns before mutations.
- **Defer v2 features:** Notification history requires schema changes. Real-time updates add complexity. Multi-admin adds auth complexity. All deferred until core validated.
- **Avoid big-bang integration:** Pitfall research shows incremental phases reduce risk of breaking existing API.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 1:** Standard patterns (session auth, monorepo setup) — skip research-phase
- **Phase 2:** Standard patterns (@fastify/static, React Query) — skip research-phase
- **Phase 3:** Standard patterns (REST mutations) — skip research-phase
- **Phase 4:** May need UX research if filter requirements complex — evaluate during planning
- **Phase 5:** May need Docker optimization research — evaluate during planning

**All phases use well-documented patterns.** Project research provided sufficient technical detail. Phase-specific research only needed if requirements expand beyond identified scope.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official documentation verified for all core technologies. Version compatibility confirmed via package registries. |
| Features | MEDIUM | Based on competitor analysis (Bull-Board, Taskforce) and webhook delivery patterns (Stripe, GitHub). Single admin use case is simpler than generic dashboards. |
| Architecture | HIGH | @fastify/static patterns verified, pnpm workspace setup documented, monorepo structure follows established patterns. |
| Pitfalls | HIGH | Auth mixing, SPA routing, real-time polling are well-documented failure modes. Mitigation strategies proven. |

**Overall confidence:** HIGH

### Gaps to Address

**Gaps identified during research:**

- **Admin credential management:** Research recommends httpOnly session cookies but doesn't specify initial admin user creation. Need to decide: environment variable for MVP, or database table with migration script? **Recommendation:** Single admin user from env vars for v1, plan migration to admin_users table for v1.x.

- **Error log retention:** Research shows displaying error details is table stakes, but doesn't specify how long to keep error logs in app_repositories.last_error. **Recommendation:** Keep current approach (overwrite on each failure), add notification history table in v2 if audit trail needed.

- **Circuit breaker display priority:** Listed as "should-have" but existing schema already has repositories.circuit_open_until. Implementation cost is low. **Recommendation:** Include in Phase 2 display rather than Phase 4.

- **Recharts vs Chart.js:** Stack research shows MEDIUM confidence on Recharts for visualization. **Recommendation:** Defer charts to v1.x. Dashboard v1 uses counts/tables only. Validate chart needs with real usage before choosing library.

- **Notification endpoint editing:** Features research lists as anti-feature (should use API), but no API endpoint exists for updating app callback_url. **Recommendation:** Read-only display in v1, add PUT /api/apps/:id endpoint if editing needed (outside admin dashboard scope).

## Sources

### Primary (HIGH confidence)
- Official documentation for React 19, Vite 6, Tailwind 4, TanStack Query/Table, Fastify plugins
- Package registries (npm, pnpm) for version verification
- Docora codebase (existing patterns, schema, auth mechanism)

### Secondary (MEDIUM confidence)
- Bull-Board, Taskforce.sh feature analysis for job queue dashboard patterns
- Stripe/GitHub webhook documentation for delivery status patterns
- Community monorepo tutorials (pnpm workspaces, type sharing)

### Tertiary (LOW confidence, needs validation)
- Admin dashboard UX best practices (empty states, loading patterns)
- React security recommendations (validated against official React docs)

**Research quality:** Stack and Architecture research based primarily on official sources. Features research inferred from competitor analysis and domain patterns. Pitfalls research synthesized from community experience and verified against official security guides.

---
*Research completed: 2026-01-26*
*Ready for roadmap: yes*
