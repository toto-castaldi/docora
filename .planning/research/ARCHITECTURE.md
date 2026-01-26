# Architecture Research

**Domain:** React Admin Dashboard integrated with Fastify Backend (Monorepo)
**Researched:** 2026-01-26
**Confidence:** HIGH

## System Overview

```
+--------------------------------------------------------------------+
|                        Docker Container                             |
+--------------------------------------------------------------------+
|                                                                     |
|  +------------------------+    +-----------------------------+      |
|  |    Caddy (Reverse      |    |   Fastify Server (:3000)   |      |
|  |    Proxy :443)         |<-->|                             |      |
|  +------------------------+    |  +-----------------------+  |      |
|         |                      |  | @fastify/static       |  |      |
|         |                      |  | (dashboard/dist/)     |  |      |
|         |                      |  +-----------------------+  |      |
|         |                      |                             |      |
|         |                      |  +-----------------------+  |      |
|         |                      |  | /api/* routes         |  |      |
|         |                      |  | (existing app routes) |  |      |
|         |                      |  +-----------------------+  |      |
|         |                      |                             |      |
|         |                      |  +-----------------------+  |      |
|         v                      |  | /admin/api/* routes   |  |      |
|   (Static docs site)           |  | (new admin endpoints) |  |      |
|                                |  +-----------------------+  |      |
|                                +-----------------------------+      |
|                                              |                      |
|                                              v                      |
|                                    +------------------+             |
|                                    | PostgreSQL       |             |
|                                    | Redis            |             |
|                                    +------------------+             |
+--------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Caddy | TLS termination, reverse proxy routing | Routes /api to Fastify, /docs to docs-site |
| Fastify Server | API endpoints, static dashboard serving | @fastify/static + route handlers |
| @fastify/static | Serve React build artifacts | Serves dashboard/dist/ with SPA fallback |
| Admin API Routes | Dashboard-specific endpoints | /admin/api/* with admin auth |
| Dashboard (React) | Admin UI for monitoring | Vite + React + React Router |
| Shared Types | TypeScript types for API contracts | packages/shared-types/ |

## Recommended Project Structure

```
docora/
├── src/                        # Existing Fastify backend
│   ├── index.ts
│   ├── server.ts
│   ├── routes/
│   │   ├── index.ts
│   │   ├── health.ts
│   │   ├── apps/               # Existing app routes
│   │   ├── repositories/       # Existing repo routes
│   │   └── admin/              # NEW: Admin dashboard API
│   │       ├── index.ts        # Admin route aggregator
│   │       ├── auth.ts         # Admin login/logout
│   │       ├── stats.ts        # Dashboard statistics
│   │       ├── apps.ts         # App management
│   │       └── repositories.ts # Repo management
│   ├── plugins/
│   │   ├── auth.ts             # Existing app auth
│   │   ├── admin-auth.ts       # NEW: Admin session auth
│   │   └── dashboard.ts        # NEW: @fastify/static config
│   └── ...
├── dashboard/                  # NEW: React admin dashboard
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                # API client
│       │   └── client.ts
│       ├── auth/               # Auth context + hooks
│       │   ├── AuthContext.tsx
│       │   └── useAuth.ts
│       ├── pages/              # Route pages
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Apps.tsx
│       │   └── Repositories.tsx
│       ├── components/         # Shared components
│       └── hooks/              # Custom hooks
├── packages/                   # NEW: Shared packages
│   └── shared-types/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── admin.ts        # Admin API types
│           └── api.ts          # Shared API types
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # NEW: Workspace definition
├── tsconfig.base.json          # NEW: Shared TS config
├── Dockerfile                  # Updated: multi-stage build
└── deploy/
    └── docker-compose.yml
```

### Structure Rationale

- **dashboard/:** Separate package for frontend, allowing independent tooling (Vite) while sharing types
- **packages/shared-types/:** Single source of truth for API contracts, consumed by both src/ and dashboard/
- **src/routes/admin/:** Admin routes isolated from existing app routes, different auth mechanism
- **src/plugins/dashboard.ts:** Centralized @fastify/static configuration for serving React build

## Architectural Patterns

### Pattern 1: Monorepo with pnpm Workspaces

**What:** Single repository containing backend, frontend, and shared packages with pnpm workspace linking.
**When to use:** When frontend and backend share types, when single deployment is desired.
**Trade-offs:**
- (+) Single source of truth for types
- (+) Atomic changes across stack
- (+) Simplified CI/CD
- (-) Slightly more complex initial setup
- (-) Build orchestration needed

**Configuration:**
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'dashboard'
```

```json
// Root package.json
{
  "scripts": {
    "dev": "pnpm --parallel run dev",
    "build": "pnpm --filter shared-types build && pnpm --filter dashboard build && pnpm --filter docora build",
    "dev:api": "pnpm --filter docora run dev",
    "dev:dashboard": "pnpm --filter dashboard run dev"
  }
}
```

### Pattern 2: Static File Serving with SPA Fallback

**What:** Fastify serves React build via @fastify/static with catch-all for client-side routing.
**When to use:** Single container deployment, simple infrastructure.
**Trade-offs:**
- (+) Single port/container for API + dashboard
- (+) No CORS configuration needed
- (+) Simpler deployment
- (-) Node.js serving static files (less optimal than nginx)
- (-) Frontend builds coupled to backend deployment

**Example:**
```typescript
// src/plugins/dashboard.ts
import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';

async function dashboardPlugin(server: FastifyInstance): Promise<void> {
  // Serve dashboard static files
  await server.register(fastifyStatic, {
    root: join(import.meta.dirname, '../../dashboard/dist'),
    prefix: '/dashboard/',
    decorateReply: true,
  });

  // SPA fallback for client-side routing
  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/dashboard')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: 'Not found' });
  });
}

export default fp(dashboardPlugin, { name: 'dashboard' });
```

### Pattern 3: Separate Admin Auth from App Auth

**What:** Admin users authenticate differently from registered apps. Apps use bearer tokens, admins use session/JWT.
**When to use:** When admin access model differs from API client access model.
**Trade-offs:**
- (+) Clear separation of concerns
- (+) Admin auth can use sessions (better for browser)
- (+) Doesn't pollute existing auth flow
- (-) Two auth systems to maintain

**Example:**
```typescript
// src/plugins/admin-auth.ts
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

async function adminAuthPlugin(server: FastifyInstance): Promise<void> {
  await server.register(fastifyCookie);
  await server.register(fastifySession, {
    secret: process.env.ADMIN_SESSION_SECRET!,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  });

  // Admin auth hook for /admin/api/* routes
  server.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/admin/api') &&
        !request.url.includes('/admin/api/auth/login')) {
      if (!request.session.adminId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });
}

export default fp(adminAuthPlugin, { name: 'admin-auth' });
```

## Data Flow

### Request Flow (Dashboard)

```
[Browser: /dashboard/apps]
    |
    v
[Fastify Server]
    |
    +--> URL starts with /dashboard & is file? --> @fastify/static --> [dashboard/dist/*]
    |
    +--> URL is /dashboard/* (no file match) --> SPA fallback --> [index.html]
    |
    +--> URL is /admin/api/* --> [Admin Auth Hook] --> [Admin Route Handler]
    |
    +--> URL is /api/* --> [App Auth Hook] --> [App Route Handler]
```

### Admin Authentication Flow

```
[Login Page]
    |
    v
POST /admin/api/auth/login { username, password }
    |
    v
[Fastify validates credentials against admin_users table]
    |
    v
[Session created, httpOnly cookie set]
    |
    v
[React stores minimal state, relies on cookie for auth]
    |
    v
[Subsequent requests include cookie automatically]
```

### Key Data Flows

1. **Dashboard Load:** Browser requests /dashboard, Fastify serves index.html, React boots and fetches initial data from /admin/api/stats
2. **Admin Login:** POST to /admin/api/auth/login, server validates, sets session cookie, React redirects to dashboard
3. **Data Fetch:** React calls /admin/api/apps, admin-auth hook validates session, handler queries DB, returns JSON

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Current design sufficient - single Fastify container serves both |
| 1k-100k users | Consider nginx in front for static files, Fastify only for API |
| 100k+ users | Separate dashboard to CDN/static hosting, API behind load balancer |

### Scaling Priorities

1. **First bottleneck:** Static file serving - move dashboard to CDN/nginx if Fastify CPU becomes constraint
2. **Second bottleneck:** Database queries - add caching layer (Redis already present) for dashboard stats

## Anti-Patterns

### Anti-Pattern 1: Storing JWT in localStorage

**What people do:** Store admin JWT tokens in browser localStorage for persistence.
**Why it's wrong:** Vulnerable to XSS attacks - any injected script can steal tokens.
**Do this instead:** Use httpOnly session cookies. Server manages session, cookie is inaccessible to JavaScript.

### Anti-Pattern 2: Single Auth System for Apps and Admins

**What people do:** Try to use the existing app bearer token auth for admin dashboard.
**Why it's wrong:** App tokens are long-lived, meant for server-to-server. Admins need session management, logout, timeout.
**Do this instead:** Separate admin auth with sessions. Keep existing app auth unchanged.

### Anti-Pattern 3: Embedding Dashboard Build in Backend Docker Image

**What people do:** Copy dashboard source into backend Dockerfile, build everything together.
**Why it's wrong:** Backend rebuilds trigger dashboard rebuilds. Long build times. Large images.
**Do this instead:** Multi-stage build that builds dashboard first, copies only dist/ to final image.

### Anti-Pattern 4: Wildcard Proxy for Development

**What people do:** Proxy all non-API requests to Vite dev server in development.
**Why it's wrong:** Production and development routing diverge, leading to "works on my machine" bugs.
**Do this instead:** In development, run dashboard on separate port (5173) with Vite proxy to API (3000). Keep production routing in Fastify for staging/testing.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL | Existing Kysely connection | Admin queries use same pool |
| Redis | BullMQ for jobs | Dashboard can show job status |
| GitHub API | Existing Octokit client | Dashboard displays repo info |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Dashboard <-> Admin API | REST/JSON over /admin/api/* | Typed with shared-types package |
| Admin API <-> Services | Direct function calls | Reuse existing services where applicable |
| Admin API <-> Repositories | Kysely queries | May need new admin-specific queries |

## Build Order Dependencies

For the monorepo build to succeed, packages must build in order:

```
1. packages/shared-types   (no dependencies)
       |
       v
2. dashboard              (depends on shared-types)
   src/                   (depends on shared-types)
       |
       v
3. Docker image           (needs dashboard/dist/ and src/dist/)
```

**Implication for roadmap phases:**
- Phase 1: Set up monorepo structure, shared-types package
- Phase 2: Admin API routes (can test without dashboard)
- Phase 3: Dashboard development (depends on admin API)
- Phase 4: Docker integration (depends on both being buildable)

## Recommended Technologies

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Frontend Build | Vite | 6.x | Fast builds, excellent React support, industry standard |
| Frontend Framework | React | 19.x | Team familiarity, ecosystem |
| Routing | React Router | 7.x | SPA routing standard |
| State | TanStack Query | 5.x | Server state management, caching |
| Static Serving | @fastify/static | 8.x | Native Fastify integration |
| Admin Session | @fastify/session | 11.x | Session management |
| Cookies | @fastify/cookie | 11.x | Required for sessions |

## Sources

- [fastify-static GitHub Repository](https://github.com/fastify/fastify-static)
- [@fastify/static npm](https://www.npmjs.com/package/@fastify/static)
- [Fastify Routes Documentation](https://fastify.dev/docs/latest/Reference/Routes/)
- [Sharing Types in pnpm Monorepo - DEV Community](https://dev.to/lico/step-by-step-guide-sharing-types-and-values-between-react-esm-and-nestjs-cjs-in-a-pnpm-monorepo-2o2j)
- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Guide to Containerizing SPA with Multi-Stage Nginx Build](https://dev.to/it-wibrc/guide-to-containerizing-a-modern-javascript-spa-vuevitereact-with-a-multi-stage-nginx-build-1lma)
- [Handling JWT in Admin Apps - Marmelab](https://marmelab.com/blog/2020/07/02/manage-your-jwt-react-admin-authentication-in-memory.html)
- [Full-stack Monorepo with ts-rest + React + Fastify](https://firxworx.com/blog/code/2024-06-11-sharing-a-full-stack-project-monorepo-template-with-ts-rest-react-fastify/)
- [Building Production Docker for Vite + React](https://alvincrespo.hashnode.dev/react-vite-production-ready-docker)
- [Fastify API Versioning](https://webcheerz.com/fastify-api-versioning/)

---
*Architecture research for: React Admin Dashboard integrated with Fastify Backend*
*Researched: 2026-01-26*
