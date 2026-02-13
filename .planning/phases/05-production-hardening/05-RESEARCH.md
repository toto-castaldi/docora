# Phase 5: Production Hardening - Research

**Researched:** 2026-02-13
**Domain:** Security headers, rate limiting, error handling, Docker build optimization, React UX hardening
**Confidence:** HIGH

## Summary

Phase 5 hardens the Docora admin dashboard for production. The codebase already has foundational security (Helmet with defaults, global rate limiting at 100 req/min, session-based auth with httpOnly/secure cookies, HMAC signatures). However, several gaps remain: CSP headers are using Helmet defaults (which block the SPA's inline scripts), rate limiting is not scoped to admin endpoints, there is no global Fastify error handler (errors could leak stack traces), the React app has no ErrorBoundary, and the Docker image does not include the dashboard build.

The work spans six areas: (1) configure CSP headers compatible with the Vite-built SPA, (2) add stricter rate limiting on the login endpoint to prevent brute-force attacks, (3) add a global Fastify error handler that hides internals, (4) add React ErrorBoundary components and audit loading/error/empty states across all pages, (5) update the Dockerfile to build and bundle the dashboard, and (6) ensure all empty states guide the admin user.

**Primary recommendation:** Use the existing `@fastify/helmet` and `@fastify/rate-limit` plugins (already installed) with expanded configuration. Add `react-error-boundary` (one new dependency) for the React side. Update the Dockerfile to a 3-stage build (backend build, dashboard build, production).

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/helmet` | ^13.0.2 | Security headers + CSP | Already registered; supports per-route CSP config and nonce generation |
| `@fastify/rate-limit` | ^10.3.0 | Rate limiting | Already registered globally; supports route-level config overrides |
| `react-error-boundary` | ^5.x | React error boundary | De facto standard (by Dan Abramov/bvaughn), 25 code snippets in Context7, HIGH reputation |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hot-toast` | ^2.6.0 | User-facing error notifications | Already used for mutation errors, extend to API errors |
| `lucide-react` | ^0.563.0 | Icons for empty/error states | Already used throughout dashboard |
| `@tanstack/react-query` | ^5.90.20 | Data fetching with error/loading states | Already configured with staleTime, retry, polling |

### New Dependency Required

| Library | Version | Purpose | Why Needed |
|---------|---------|---------|------------|
| `react-error-boundary` | ^5.0.0 | Declarative error boundaries | Handles uncaught React rendering errors without custom class components |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-error-boundary` | Custom class component | Manual implementation requires maintaining class component lifecycle; library is tiny (~1KB) and well-maintained |
| CSP nonces via Helmet | CSP with `'unsafe-inline'` | Nonces are more secure but complex when Vite hashes assets; Vite already produces content-hashed filenames so `'self'` suffices for scripts/styles |
| Per-route rate limit | Separate `@fastify/rate-limit` instances | Unnecessary; the plugin supports `config.rateLimit` per-route natively |

**Installation:**
```bash
pnpm --filter dashboard add react-error-boundary
```

## Architecture Patterns

### Pattern 1: CSP Configuration for Vite SPA

**What:** Configure `@fastify/helmet` with CSP directives that allow the Vite-built SPA assets to load correctly.

**When to use:** When serving a pre-built SPA through Fastify with Helmet.

**Key insight:** Vite's production build produces content-hashed JS/CSS files loaded via `<script type="module" src="/admin/assets/index-XXXXX.js">` and `<link>` tags -- NOT inline scripts. Therefore `'self'` is sufficient for `scriptSrc` and `styleSrc`. No nonces or `'unsafe-inline'` needed for the module scripts.

**However:** Vite's dev mode and react-hot-toast may inject inline styles. For production, `styleSrc: ["'self'", "'unsafe-inline'"]` is the pragmatic choice since CSS injection is low-risk compared to script injection.

**Configuration approach:**
```typescript
// Source: Context7 /fastify/fastify-helmet
await server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
});
```

### Pattern 2: Tiered Rate Limiting

**What:** Keep global rate limit (100/min) for all routes, add stricter limit on login endpoint to prevent brute-force.

**When to use:** When different endpoints have different abuse risk profiles.

**Configuration approach:**
```typescript
// Source: Context7 /fastify/fastify-rate-limit
// Global registration remains as-is (100/min)
await server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Login endpoint gets stricter limit via route config
fastify.post('/admin/api/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
    },
  },
}, handler);
```

### Pattern 3: Global Error Handler

**What:** Fastify `setErrorHandler` that catches unhandled errors, logs them, and returns safe responses.

**When to use:** As the last line of defense against leaking stack traces or internal details.

**Configuration approach:**
```typescript
// Source: Context7 /fastify/fastify
server.setErrorHandler(function (error, request, reply) {
  request.log.error(error);

  // Validation errors (Zod via fastify-type-provider-zod)
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
    });
  }

  // Known HTTP errors (4xx with statusCode set)
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      error: error.message,
    });
  }

  // Everything else -> generic 500
  return reply.code(500).send({
    error: 'Internal Server Error',
  });
});
```

### Pattern 4: React ErrorBoundary

**What:** Wrap the app in `ErrorBoundary` to catch rendering errors.

**When to use:** At the top level and optionally around each page.

**Configuration approach:**
```tsx
// Source: Context7 /bvaughn/react-error-boundary
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

// In App.tsx, wrap routes:
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Routes>...</Routes>
</ErrorBoundary>
```

### Pattern 5: Docker Multi-Stage Build with Dashboard

**What:** Add a dashboard build stage to the existing Dockerfile.

**When to use:** When the Docker image must serve both the API and the pre-built dashboard.

**Key insight:** The current Dockerfile has 2 stages (builder + production). It needs a 3rd stage for the dashboard build, or the dashboard can be built in the same builder stage. Since pnpm workspaces are used, the cleanest approach is to build everything in the builder stage.

**Structure:**
```dockerfile
FROM node:22-alpine AS builder
# Install pnpm, copy workspace files, install all deps
# Build backend: pnpm build
# Build dashboard: pnpm dashboard:build

FROM node:22-alpine AS production
# Copy dist/ (backend), dashboard/dist/ (frontend)
# Production deps only
```

### Anti-Patterns to Avoid

- **`'unsafe-eval'` in CSP:** Never allow eval for script sources; Vite production builds do not require it.
- **Single rate limit for all routes:** Login needs stricter limits than read-only endpoints.
- **Error details in 500 responses:** Never expose `error.stack` or internal messages to clients.
- **Using `window.confirm`:** The project uses `ConfirmDialog` component -- never use `window.confirm`.
- **Building dashboard at Docker runtime:** Always build at image build time for reproducibility.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSP headers | Manual header middleware | `@fastify/helmet` contentSecurityPolicy directives | Handles CSP complexity, nonces, report-only mode, per-route overrides |
| Rate limiting | Custom request counter | `@fastify/rate-limit` with route config | Handles Redis store, sliding windows, headers, grouping |
| React error boundaries | Class component with `componentDidCatch` | `react-error-boundary` | Declarative API, reset keys, HOC, tiny bundle |
| Error sanitization | Regex-based stack trace filtering | Fastify `setErrorHandler` with status code checks | Framework-native, handles validation errors, plugin errors |

**Key insight:** All security hardening libraries are already installed or trivial to add. The work is configuration, not implementation.

## Common Pitfalls

### Pitfall 1: CSP Blocks SPA Assets

**What goes wrong:** Default Helmet CSP blocks the dashboard's JS/CSS from loading, resulting in a blank page.
**Why it happens:** Default CSP is very restrictive. Vite-built apps need `'self'` for script-src and style-src.
**How to avoid:** Configure explicit CSP directives before deploying. Test by loading `/admin/` and checking browser console for CSP violations.
**Warning signs:** Blank page at `/admin/`, console errors mentioning `Content-Security-Policy`.

### Pitfall 2: Rate Limit Blocks Legitimate Polling

**What goes wrong:** Dashboard polling (10s interval) hits the rate limit for authenticated admin sessions.
**Why it happens:** Multiple pages poll simultaneously (Overview, Queue, etc.), consuming rate limit budget.
**How to avoid:** The global limit of 100/min is sufficient for admin polling (6 requests/min per page * ~5 pages = 30/min max). Only the login endpoint needs stricter limits (5/min).
**Warning signs:** 429 responses in the browser network tab during normal dashboard use.

### Pitfall 3: Dashboard Not Included in Docker Image

**What goes wrong:** `/admin/` returns 503 "Dashboard not built" in production.
**Why it happens:** Current Dockerfile only builds backend TypeScript, not the dashboard.
**How to avoid:** Add dashboard build step to Dockerfile. Also update `.dockerignore` to NOT exclude `dashboard/` source files.
**Warning signs:** 503 response at `/admin/` after deployment.

### Pitfall 4: Error Boundary Swallows Useful Errors

**What goes wrong:** ErrorBoundary catches errors but provides no recovery path.
**Why it happens:** Using only a static fallback without reset capability.
**How to avoid:** Use `resetKeys` (e.g., route location) so navigation resets the boundary. Provide "Try again" button that calls `resetErrorBoundary`.
**Warning signs:** Users stuck on error page with no way to recover except browser refresh.

### Pitfall 5: Stack Traces in API Error Responses

**What goes wrong:** 500 responses include full Node.js stack traces with file paths and line numbers.
**Why it happens:** No global error handler; Fastify's default error handler includes error messages.
**How to avoid:** Add `setErrorHandler` that always returns generic message for 500 errors.
**Warning signs:** Check any API endpoint that throws -- see if stack traces appear in response body.

### Pitfall 6: .dockerignore Excludes Dashboard Sources

**What goes wrong:** Docker build context excludes dashboard directory or its dependencies.
**Why it happens:** Current `.dockerignore` excludes `dist` and `node_modules` broadly.
**How to avoid:** Ensure `.dockerignore` does NOT list `dashboard/` but DOES exclude `dashboard/node_modules` and `dashboard/dist`. The dashboard sources must be available in the build context.
**Warning signs:** Docker build fails with "file not found" for dashboard files.

## Code Examples

### CSP Configuration for Helmet

```typescript
// In src/server.ts - replace bare `helmet` registration
// Source: Context7 /fastify/fastify-helmet
await server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
});
```

### Login Rate Limiting

```typescript
// In src/routes/admin/auth.ts - add to login route options
// Source: Context7 /fastify/fastify-rate-limit
fastify.post('/admin/api/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
    },
  },
  schema: { /* existing schema */ },
}, handler);
```

### Global Error Handler

```typescript
// In src/server.ts - add after plugin registrations
// Source: Context7 /fastify/fastify
server.setErrorHandler(function (error, request, reply) {
  // Always log the full error
  request.log.error(error);

  // Zod validation errors (from fastify-type-provider-zod)
  if (error.validation) {
    return reply.code(400).send({
      error: error.message,
    });
  }

  // Client errors (4xx) - safe to forward message
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      error: error.message,
    });
  }

  // Server errors (5xx) - hide internals
  return reply.code(500).send({
    error: 'Internal Server Error',
  });
});
```

### React ErrorBoundary

```tsx
// Source: Context7 /bvaughn/react-error-boundary
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className={styles.errorState}>
      <AlertTriangle size={48} />
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

// In App.tsx:
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Routes>...</Routes>
</ErrorBoundary>
```

### Updated Dockerfile

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace config and all package.json files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json dashboard/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY src ./src
COPY packages ./packages
COPY dashboard ./dashboard

# Build backend and dashboard
RUN pnpm build && pnpm dashboard:build

FROM node:22-alpine AS production
RUN apk add --no-cache git
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built backend
COPY --from=builder /app/dist ./dist
# Copy built dashboard
COPY --from=builder /app/dashboard/dist ./dashboard/dist

RUN mkdir -p /data/repos && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## Current State Analysis

### What Already Works

| Area | Status | Details |
|------|--------|---------|
| Helmet | Registered with defaults | No CSP directives configured -- uses Helmet defaults |
| Rate limiting | Global 100/min | Applied to ALL routes equally |
| Session auth | Complete | httpOnly, secure, sameSite=strict, Redis store, 1hr TTL |
| Loading states | Partial | All pages show Loader2 spinner during initial load |
| Empty states | Partial | Apps, Repos, Notifications have empty states; Overview does not |
| Error states | Minimal | AppDetail shows "not found" state; other pages only have toast errors |
| Docker | Backend only | Dashboard not built or included in Docker image |

### Gaps to Fill

| Gap | Impact | Effort |
|-----|--------|--------|
| CSP not configured | XSS protection incomplete | Low - config change |
| Login not rate-limited separately | Brute-force vulnerable | Low - route config |
| No global error handler | Stack traces may leak | Low - one function |
| No React ErrorBoundary | Unhandled render errors crash page | Low - wrap in component |
| Overview missing error state | Error in metrics fails silently (only toast) | Low - add conditional |
| Queue missing error state | Same issue | Low |
| Docker missing dashboard | Dashboard not deployed | Medium - Dockerfile rewrite |
| .dockerignore needs update | Dashboard sources excluded from build | Low - edit file |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSP `'unsafe-inline'` for scripts | Vite content-hashed assets + `'self'` | Vite 2+ (2021) | No need for nonces or unsafe-inline for scripts |
| Class-based ErrorBoundary | `react-error-boundary` library | v4.0 (2023) | Declarative, hooks-friendly, reset keys |
| Single Dockerfile stage | Multi-stage builds | Docker 17.05+ (2017) | Smaller images, separate build and runtime |
| Manual CSP header strings | Helmet CSP directives object | Helmet v6+ (2022) | Type-safe, composable, per-route overrides |

**Deprecated/outdated:**
- React `componentDidCatch` alone: Still works but `react-error-boundary` is preferred for new projects
- `helmet.contentSecurityPolicy.getDefaultDirectives()`: Still available but better to write explicit directives for clarity

## Open Questions

1. **CSP Report-URI/Report-To**
   - What we know: CSP supports `report-uri` and `report-to` directives for violation reporting
   - What's unclear: Whether Docora needs CSP violation reporting (adds complexity)
   - Recommendation: Skip for now; can be added later if needed. Focus on blocking violations.

2. **Login lockout after N failures**
   - What we know: Rate limiting returns 429 after max attempts; `@fastify/rate-limit` supports `ban` option
   - What's unclear: Whether temporary IP ban is desirable vs. just rate limiting
   - Recommendation: Start with rate limiting (5/min). The `ban` option can be added later if needed.

3. **Dashboard gzip compression**
   - What we know: Caddy (reverse proxy) can handle compression. Vite can produce gzip during build.
   - What's unclear: Whether to add `@fastify/compress` or rely on Caddy
   - Recommendation: Rely on Caddy for compression in production. No need for `@fastify/compress` since Caddy is already the edge proxy.

## Sources

### Primary (HIGH confidence)
- Context7 `/fastify/fastify-helmet` - CSP directives, per-route config, nonce generation (36 code snippets, HIGH reputation, benchmark 92.8)
- Context7 `/fastify/fastify-rate-limit` - Route-level rate limiting, groupId, global vs per-route config (22 code snippets, HIGH reputation)
- Context7 `/bvaughn/react-error-boundary` - ErrorBoundary component, FallbackComponent, resetKeys, onError callback (25 code snippets, HIGH reputation, benchmark 91.9)
- Context7 `/fastify/fastify` - setErrorHandler, error handling patterns (1297 code snippets, HIGH reputation)

### Secondary (MEDIUM confidence)
- Codebase analysis: Direct reading of `src/server.ts`, `Dockerfile`, `.dockerignore`, all admin routes, all dashboard pages
- Docker multi-stage build patterns for pnpm workspaces

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are already installed or have authoritative Context7 documentation
- Architecture: HIGH - Patterns verified against Context7 code examples and confirmed compatible with existing codebase
- Pitfalls: HIGH - Based on direct codebase analysis (gaps verified by reading actual files)
- Docker changes: MEDIUM - Multi-stage build with pnpm workspaces may need adjustments based on exact pnpm install behavior with `--prod`

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain -- security headers and Docker patterns change slowly)
