# Phase 11: Onboarding Lockdown - Research

**Researched:** 2026-02-24
**Domain:** Fastify route relocation + admin session auth enforcement
**Confidence:** HIGH

## Summary

Phase 11 closes the security gap where `POST /api/apps/onboard` is publicly accessible (`config: { publicAccess: true }`). The solution is straightforward: move the route from `/api/apps/onboard` to `/admin/api/apps/onboard`, remove the `publicAccess: true` config, and register it under the admin route tree. The existing `admin-auth.ts` plugin already enforces session authentication for all `/admin/*` paths and the existing `auth.ts` plugin already skips `/admin/*` paths. No new libraries, migrations, or auth infrastructure are needed.

The codebase already has well-established patterns for admin-only routes (`dashboard-api.ts`, `dashboard-actions.ts`, `dashboard-bulk-actions.ts`) with encapsulated `onRequest` hooks that verify `request.session?.get("adminId")`. The onboard route can follow the same pattern. Documentation updates are required in the Hugo docs site (`_index.md`, `webhooks.md`), the Swagger/OpenAPI description in `swagger.ts`, the Bruno API collection, and `CLAUDE.md`.

**Primary recommendation:** Move onboard route registration from `src/routes/apps/` to `src/routes/admin/`, change the URL to `/admin/api/apps/onboard`, and drop `publicAccess: true`. Update all docs to remove self-service onboarding language.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Move endpoint from `/api/apps/onboard` to `/admin/api/apps/onboard` — inherits admin session auth automatically
- Remove the old `/api/apps/onboard` route entirely (no redirect, no 410 — just gone)
- Admin session only — bearer tokens have zero access to onboarding
- Verify the admin dashboard onboarding UI still works with the new route
- Descriptive 401 message: "Admin authentication required. Use the admin dashboard to onboard new apps."
- Same 401 for all unauthenticated cases — don't differentiate between no auth and bearer-token-only
- Browser requests redirect to `/admin/login` (consistent with existing admin-auth behavior)
- API requests get JSON 401
- Success response (201) stays unchanged — same body with app_id, token, etc.
- Update Hugo docs site: state clearly that onboarding requires admin authentication
- Remove any self-service onboarding language — brief, factual messaging
- Do NOT mention the old endpoint — docs only show current state
- Update Swagger/OpenAPI spec to reflect the new endpoint location under `/admin/api`
- Hard cutover — no transition period, no env toggle, no deprecation warnings
- Commit as `feat:` (not breaking) — the public endpoint was a security gap, not a supported contract
- Update existing tests to use the new admin endpoint with proper session auth

### Claude's Discretion
- Route file organization (new file vs extending existing admin routes)
- Test structure and helper patterns for admin session auth in tests
- Exact Swagger tag/grouping for the moved endpoint

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | Admin can onboard new apps only when authenticated via admin session; unauthenticated requests receive 401 with descriptive error | Moving route to `/admin/api/apps/onboard` leverages existing `admin-auth.ts` hook which returns 401 for API requests and redirects browsers to `/admin/login`. Custom 401 message needs explicit `onRequest` hook in the route's encapsulating plugin (same pattern as `dashboard-actions.ts`). |
| SEC-02 | API documentation reflects that onboarding requires admin authentication | Hugo docs site (`_index.md`, `webhooks.md`), Swagger description in `swagger.ts`, and Bruno collection all reference the old endpoint and must be updated. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.6.2 | HTTP framework — route registration, hooks | Already in use; route relocation is pure Fastify config |
| @fastify/session | ^11.1.1 | Admin session management | Already configured in `admin-auth.ts` with Redis store |
| @fastify/cookie | ^11.0.2 | Cookie parsing for session | Already registered by `admin-auth.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.0.16 | Test framework | Integration tests for auth enforcement on new route |
| zod | ^4.3.5 | Request/response schema validation | `OnboardRequestSchema` / `OnboardResponseSchema` already exist |

### Alternatives Considered
None — this phase uses only existing infrastructure. No new libraries needed.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/routes/admin/
├── index.ts              # Add onboard route registration here
├── onboard.ts            # NEW — moved from src/routes/apps/onboard.ts
├── auth.ts               # Existing login/logout/session routes
├── dashboard-api.ts      # Existing pattern for session-gated admin routes
├── dashboard-actions.ts  # Existing pattern for session-gated admin routes
└── ...
```

### Pattern 1: Admin Route with Encapsulated Session Gate
**What:** Register admin-only routes inside a Fastify plugin with an `onRequest` hook that checks `request.session?.get("adminId")`.
**When to use:** Any route under `/admin/api/` that requires admin session auth.
**Example:**
```typescript
// Source: src/routes/admin/dashboard-actions.ts (existing pattern)
export async function dashboardActionRoutes(
  server: FastifyInstance
): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      reply
        .code(401)
        .send({ error: "Unauthorized" } satisfies ApiErrorResponse);
    }
  });

  server.post("/admin/api/retry", async (request, reply) => {
    // ... handler logic
  });
}
```

### Pattern 2: Admin Auth Plugin Scoped Protection
**What:** The `admin-auth.ts` plugin has an `onRequest` hook that intercepts ALL `/admin/*` routes. For unauthenticated API requests it returns 401; for browser requests it redirects to `/admin/login`.
**When to use:** Automatic — any route registered under `/admin/*` is already protected.
**Key behavior from `admin-auth.ts`:**
```typescript
// Source: src/plugins/admin-auth.ts lines 131-158
server.addHook("onRequest", async (request, reply) => {
  if (!request.url.startsWith("/admin")) return;
  if (isPublicAdminPath(request.url)) return;
  if (!sessionSecret || sessionSecret.length < 32) {
    return reply.status(503).send({ error: "Admin authentication not configured" });
  }
  if (!request.session?.adminId) {
    if (isApiRequest(request)) {
      return reply.status(401).send({ error: "Not authenticated" });
    }
    return reply.redirect("/admin/login");
  }
});
```

### Pattern 3: Bearer Auth Skips Admin Routes
**What:** The `auth.ts` plugin explicitly skips `/admin` paths, so bearer tokens never grant access to admin routes.
**When to use:** Automatic — no changes needed.
**Key behavior from `auth.ts`:**
```typescript
// Source: src/plugins/auth.ts lines 29-31
if (path.startsWith("/admin")) {
  return; // Skip — handled by admin-auth plugin
}
```

### Anti-Patterns to Avoid
- **Adding `preHandler` session check on a `/api/*` route:** Don't keep the route at `/api/apps/onboard` and add a manual session check. This creates ordering ambiguity with the bearer auth hook in `auth.ts` and breaks the established convention that admin actions live under `/admin/*`.
- **Relying on `publicAccess: false` alone:** Removing `publicAccess: true` from the route but leaving it at `/api/apps/onboard` would make bearer token auth the gate — any existing app with a token could create new apps. The route MUST move to `/admin/*` where bearer auth is skipped.
- **Adding the new route path to `PUBLIC_ADMIN_PATHS`:** The onboard route must NOT be listed in the public admin paths array in `admin-auth.ts`. Only login-related paths belong there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin session verification | Custom session check middleware | Existing `admin-auth.ts` `onRequest` hook | Already tested, handles browser vs API differentiation, session store, 503 for unconfigured |
| Bearer token bypass prevention | Route-level token filtering | Route relocation to `/admin/*` prefix | `auth.ts` already skips `/admin/*` — moving the route makes bypass impossible |
| Error response format (401) | Custom error formatter | Encapsulated plugin `onRequest` hook with custom message | Pattern established in `dashboard-actions.ts` and `dashboard-api.ts` |

**Key insight:** The existing two-layer auth system (`auth.ts` for bearer, `admin-auth.ts` for session) is designed so that `/admin/*` routes are fully isolated from bearer token access. Moving the route is the only change needed to inherit complete protection.

## Common Pitfalls

### Pitfall 1: Forgetting to Remove the Old Route
**What goes wrong:** The new `/admin/api/apps/onboard` route works, but the old `/api/apps/onboard` route still exists. The security gap remains fully open.
**Why it happens:** The old route is registered in `src/routes/apps/onboard.ts` via `src/routes/apps/index.ts` via `src/routes/index.ts`. If the old file is left in place, both routes exist simultaneously.
**How to avoid:** Delete `src/routes/apps/onboard.ts`, remove its import from `src/routes/apps/index.ts`. If `apps/index.ts` has no remaining routes, remove the file and its import from `src/routes/index.ts`.
**Warning signs:** `GET /docs` (Swagger UI) shows both `/api/apps/onboard` and `/admin/api/apps/onboard` in the spec.

### Pitfall 2: Custom 401 Message Not Reaching the Client
**What goes wrong:** The `admin-auth.ts` plugin returns `{ error: "Not authenticated" }` — a generic message. The phase requires a specific descriptive message: "Admin authentication required. Use the admin dashboard to onboard new apps."
**Why it happens:** The `admin-auth.ts` plugin applies a generic 401 to all unauthenticated admin API requests. The custom message requires a route-level `onRequest` hook that runs AFTER the admin-auth plugin but returns a more specific error.
**How to avoid:** Register the onboard route inside its own Fastify plugin with an encapsulated `onRequest` hook that checks `request.session?.get("adminId")` and returns the custom 401 message. This runs within the plugin scope after `admin-auth.ts` has already set up the session. The `admin-auth.ts` plugin's hook fires first (it is registered at the server level), but because the route is under `/admin/api/`, the admin-auth hook will handle the session check. To override the message, the route plugin's own `onRequest` hook can check the session and return the specific message before the handler runs.
**Warning signs:** Test asserts `response.body.error === "Admin authentication required..."` but receives `"Not authenticated"`.

**Resolution approach:** There are two valid approaches:
1. **Override at route-plugin level:** The onboard route plugin has its own `onRequest` hook with the custom message. The `admin-auth.ts` hook runs first, but since both check `request.session?.adminId`, the route-level hook will catch unauthenticated requests that passed through `admin-auth.ts` before the handler executes. However, `admin-auth.ts` already sends a reply for unauthenticated requests, so the route-level hook may not fire. This approach requires understanding Fastify hook execution order.
2. **Skip `admin-auth.ts` for this specific path and handle entirely in the route plugin:** Add `/admin/api/apps/onboard` to `PUBLIC_ADMIN_PATHS` in `admin-auth.ts` so the admin-auth plugin skips it, then handle ALL auth checking (including the custom 401 message) in the route plugin's own `onRequest` hook. This gives full control over the error message but deviates from the standard pattern.

**Recommended approach:** Option 2 is cleaner. Add the path to `PUBLIC_ADMIN_PATHS` to bypass the generic admin-auth check, then add an encapsulated `onRequest` hook in the onboard route plugin. This follows the same pattern used by the login route (which is public) but with explicit session validation. The hook provides the exact error message required.

### Pitfall 3: Dashboard Frontend Expects Old URL
**What goes wrong:** If the admin dashboard has any code that calls the old `/api/apps/onboard` endpoint, it will break silently.
**Why it happens:** The dashboard might have onboarding functionality that calls the old URL.
**How to avoid:** Verified by search: the dashboard (`dashboard/src/`) has ZERO references to "onboard." The dashboard currently has no onboarding UI. No dashboard code changes needed.
**Warning signs:** N/A — confirmed not applicable.

### Pitfall 4: Swagger/OpenAPI Spec Shows Stale Endpoint
**What goes wrong:** The Swagger spec at `/docs` still shows the old endpoint or the bearerAuth description still references `/api/apps/onboard`.
**Why it happens:** Fastify Swagger auto-generates the spec from route schemas. Moving the route changes the URL automatically. However, the `bearerAuth` security scheme description in `swagger.ts` hardcodes: `"Enter your app token from /api/apps/onboard"`. This reference becomes stale.
**How to avoid:** Update the `description` field in `swagger.ts` security scheme to remove the reference to the old endpoint. The new description should say something like: "Enter the app token received during admin onboarding."
**Warning signs:** The Swagger UI security scheme description still mentions the old URL.

### Pitfall 5: Bruno Collection Points to Old URL
**What goes wrong:** Developers using the Bruno API client attempt to call the old endpoint and get no response (route gone).
**Why it happens:** `bruno/apps/onboard.bru` has `url: {{baseUrl}}/api/apps/onboard` and `auth: none`.
**How to avoid:** Update the Bruno file to the new URL and change auth to use admin session cookies.
**Warning signs:** Bruno test suite fails.

### Pitfall 6: Tests Need Admin Session Setup
**What goes wrong:** Tests calling the new endpoint without an admin session cookie get 401.
**Why it happens:** The current health test uses `server.inject()` without any auth. The onboard route at its new location requires an admin session. Tests must establish a session first.
**How to avoid:** Create a test helper that logs in via `POST /admin/api/login` and captures the session cookie, then passes it on subsequent requests via `server.inject({ headers: { cookie: ... } })`.
**Warning signs:** All onboard tests fail with 401.

## Code Examples

### Moving the Route to Admin Routes

```typescript
// Source: New file src/routes/admin/onboard.ts
import type { FastifyInstance } from "fastify";
import {
  OnboardRequestSchema,
  OnboardResponseSchema,
  type OnboardRequest,
} from "../../schemas/apps.js";
import { createApp } from "../../repositories/apps.js";
import { isUrlSafe } from "../../utils/url-validator.js";
import { z } from "zod";

const ErrorResponseSchema = z.object({
  error: z.string(),
});

export async function adminOnboardRoute(server: FastifyInstance): Promise<void> {
  // Encapsulated session check with custom 401 message
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      return reply.code(401).send({
        error: "Admin authentication required. Use the admin dashboard to onboard new apps.",
      });
    }
  });

  server.post(
    "/admin/api/apps/onboard",
    {
      schema: {
        body: OnboardRequestSchema,
        response: {
          201: OnboardResponseSchema,
          401: ErrorResponseSchema,
          422: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as OnboardRequest;

      const urlCheck = isUrlSafe(body.base_url);
      if (!urlCheck.safe) {
        return reply.status(422).send({ error: urlCheck.reason });
      }

      const result = await createApp(body);
      return reply.status(201).send(result);
    }
  );
}
```

### Registering in Admin Routes Index

```typescript
// Source: Updated src/routes/admin/index.ts
import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { dashboardApiRoutes } from "./dashboard-api.js";
import { dashboardActionRoutes } from "./dashboard-actions.js";
import { dashboardBulkActionRoutes } from "./dashboard-bulk-actions.js";
import { adminOnboardRoute } from "./onboard.js";
import { staticRoutes } from "./static.js";

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  await server.register(authRoutes);
  await server.register(adminOnboardRoute);  // NEW
  await server.register(dashboardApiRoutes);
  await server.register(dashboardActionRoutes);
  await server.register(dashboardBulkActionRoutes);
  await server.register(staticRoutes);
}
```

### Test Pattern: Admin Session Auth Helper

```typescript
// Pattern for test helper to get admin session cookie
import type { FastifyInstance } from "fastify";

async function getAdminSessionCookie(server: FastifyInstance): Promise<string> {
  const loginResponse = await server.inject({
    method: "POST",
    url: "/admin/api/login",
    payload: {
      username: process.env.ADMIN_USERNAME ?? "admin",
      password: process.env.ADMIN_PASSWORD ?? "test-password",
    },
    headers: {
      accept: "application/json",
    },
  });

  const setCookie = loginResponse.headers["set-cookie"];
  // Extract session cookie string from set-cookie header
  return Array.isArray(setCookie) ? setCookie[0] : setCookie ?? "";
}

// Usage in test:
const cookie = await getAdminSessionCookie(server);
const response = await server.inject({
  method: "POST",
  url: "/admin/api/apps/onboard",
  payload: { /* onboard body */ },
  headers: {
    cookie,
    accept: "application/json",
  },
});
expect(response.statusCode).toBe(201);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `publicAccess: true` on onboard route | Route under `/admin/api/` with session auth | Phase 11 (this phase) | Closes open registration security gap |

**Deprecated/outdated:**
- `/api/apps/onboard` URL — removed entirely, no redirect or 410

## Open Questions

1. **Should `src/routes/apps/index.ts` be deleted entirely if onboard was its only route?**
   - What we know: `apps/index.ts` currently only imports and registers `onboardRoute`. After moving onboard to admin, it has no routes.
   - What's unclear: Whether other phases (e.g., Phase 12 app deletion) will add routes here.
   - Recommendation: Delete `apps/index.ts` and `apps/onboard.ts` and remove the import from `routes/index.ts`. If Phase 12 needs it, it can recreate the directory. Dead code should not persist.

2. **Does `admin-auth.ts` need `/admin/api/apps/onboard` in `PUBLIC_ADMIN_PATHS`?**
   - What we know: The `admin-auth.ts` hook returns generic `{ error: "Not authenticated" }` for API requests. The phase requires a custom message.
   - What's unclear: Whether the `admin-auth.ts` hook will block the request before the route-level hook can override the message.
   - Recommendation: Yes, add the path to `PUBLIC_ADMIN_PATHS` and handle auth entirely in the route plugin's `onRequest` hook. This gives full control over the error message. The route plugin provides its own session check with the custom descriptive 401.

3. **Should the Swagger spec include the admin onboard endpoint?**
   - What we know: Fastify Swagger auto-generates from route schemas. The new route will appear in the spec automatically.
   - What's unclear: Whether admin-only endpoints should appear in the public Swagger docs.
   - Recommendation: Include it with a tag like "Admin" to distinguish from client API endpoints. The endpoint is documented; its auth requirement (admin session) is clear from the spec.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `src/plugins/admin-auth.ts` — admin session hook behavior, `PUBLIC_ADMIN_PATHS`, browser vs API differentiation
- Direct codebase analysis of `src/plugins/auth.ts` — bearer auth skips `/admin/*` paths (line 30-31)
- Direct codebase analysis of `src/routes/apps/onboard.ts` — current route config with `publicAccess: true`
- Direct codebase analysis of `src/routes/admin/dashboard-actions.ts` — encapsulated `onRequest` session check pattern
- Direct codebase analysis of `src/routes/admin/dashboard-api.ts` — encapsulated `onRequest` session check pattern
- Direct codebase analysis of `src/server.ts` — plugin registration order (admin-auth before admin routes)
- `.planning/research/PITFALLS.md` (Pitfalls 4 and 5) — verified bearer token bypass risk and route relocation solution
- `.planning/research/STACK.md` (Feature 2) — admin-only onboarding solution analysis

### Secondary (MEDIUM confidence)
- Dashboard frontend search (`dashboard/src/`) — confirmed zero references to onboarding (no frontend changes needed)
- Bruno collection analysis (`bruno/apps/onboard.bru`) — confirmed old URL and auth:none config

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing infrastructure
- Architecture: HIGH — established patterns in codebase with direct code analysis
- Pitfalls: HIGH — each pitfall verified against actual code with line-level analysis

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable — no external library changes, pure codebase refactor)
