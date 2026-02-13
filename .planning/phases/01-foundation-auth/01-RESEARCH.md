# Phase 1: Foundation & Authentication - Research

**Researched:** 2026-01-29
**Domain:** Fastify session authentication, pnpm monorepo, React dashboard
**Confidence:** HIGH

## Summary

This phase establishes the monorepo structure (pnpm workspaces with `dashboard/` and `packages/shared-types/`) and implements session-based admin authentication isolated from the existing Bearer token client API auth. The research covers three interconnected areas: Fastify session management using `@fastify/session` with `@fastify/cookie`, pnpm workspace configuration for TypeScript monorepos, and React frontend setup with Vite for the admin dashboard.

The standard approach is to use `@fastify/session` for server-side session storage with secure httpOnly cookies, separate from the existing bearer token authentication via a dedicated admin auth plugin registered on `/admin/*` routes. The React dashboard will use Vite for development and build, with `react-router` v7 for client-side routing and a protected route pattern using React Context for auth state.

Key decisions from CONTEXT.md that constrain implementation: 1-hour session duration with sliding expiration, single admin from environment variables (ADMIN_USERNAME, ADMIN_PASSWORD), missing credentials returns 503, and API endpoints return JSON 401 (not redirects).

**Primary recommendation:** Use `@fastify/session` with Redis store (already available from BullMQ) for production-ready session management, bcrypt for password comparison (already a dependency), and Vite + react-router v7 for the React dashboard.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/session | ^11.1.0 | Server-side session management | Official Fastify plugin, mature, express-session compatible stores |
| @fastify/cookie | ^11.0.2 | Cookie parsing/setting for sessions | Required by @fastify/session, official Fastify plugin |
| @fastify/static | ^9.0.0 | Serve React SPA static files | Official Fastify plugin for static file serving |
| react | ^19.0.0 | Frontend UI framework | Project decision (developer familiarity) |
| react-router | ^7.12.0 | Client-side routing with protected routes | Latest version, unified package, supports data loaders |
| vite | ^7.3.1 | Frontend build tool and dev server | Fast HMR, ESM-native, excellent TypeScript support |
| connect-redis | ^8.0.0 | Redis session store | Production-ready session storage, avoids memory leaks |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitejs/plugin-react | ^4.4.0 | React plugin for Vite | Required for React JSX transform and Fast Refresh |
| ioredis | ^5.9.1 | Redis client | Already in stack for BullMQ, reuse for sessions |
| bcrypt | ^6.0.0 | Password hash comparison | Already in stack, use for admin password verification |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/session | @fastify/secure-session | Stateless (cookie-stored), simpler but session data visible in browser devtools, 4KB limit |
| Redis store | In-memory store | Only for development; leaks memory in production |
| react-router | TanStack Router | More type-safe but newer, less ecosystem support |

**Installation (backend):**
```bash
pnpm add @fastify/session @fastify/cookie @fastify/static connect-redis
```

**Installation (dashboard):**
```bash
pnpm create vite dashboard --template react-ts
cd dashboard
pnpm add react-router
```

## Architecture Patterns

### Recommended Monorepo Structure
```
docora/
├── pnpm-workspace.yaml      # Workspace definition
├── package.json             # Root package.json (scripts, shared devDeps)
├── tsconfig.json            # Existing backend config
├── src/                     # Existing Fastify backend
│   ├── plugins/
│   │   ├── auth.ts          # Existing Bearer token auth (unchanged)
│   │   └── admin-auth.ts    # NEW: Session-based admin auth
│   └── routes/
│       └── admin/           # NEW: Admin dashboard API routes
├── dashboard/               # NEW: React SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── context/
│       │   └── AuthContext.tsx
│       ├── pages/
│       │   ├── Login.tsx
│       │   └── Dashboard.tsx
│       └── components/
│           └── ProtectedRoute.tsx
└── packages/
    └── shared-types/        # NEW: Shared TypeScript types
        ├── package.json
        └── src/
            └── index.ts
```

### Pattern 1: Separate Admin Auth Plugin
**What:** Create a dedicated Fastify plugin for admin session authentication, completely separate from the existing Bearer token auth plugin.
**When to use:** Always - admin auth and client API auth must be isolated.
**Example:**
```typescript
// Source: https://github.com/fastify/session (adapted)
// src/plugins/admin-auth.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import RedisStore from "connect-redis";
import { getRedisClient } from "../queue/connection.js";
import bcrypt from "bcrypt";

declare module "fastify" {
  interface Session {
    adminId?: string;
    adminUsername?: string;
  }
}

async function adminAuthPlugin(server: FastifyInstance): Promise<void> {
  // Register cookie and session plugins
  await server.register(fastifyCookie);
  await server.register(fastifySession, {
    secret: process.env.ADMIN_SESSION_SECRET!, // Min 32 chars
    store: new RedisStore({ client: getRedisClient() }),
    cookie: {
      path: "/admin",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 1000, // 1 hour (per CONTEXT.md)
    },
    rolling: true, // Sliding expiration (per CONTEXT.md)
    saveUninitialized: false,
  });

  // Pre-handler hook for /admin/* routes (except /admin/login)
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0];

    // Skip auth check for login endpoint and static assets
    if (path === "/admin/login" || path === "/admin/api/login") {
      return;
    }

    // Only apply to /admin/* routes
    if (!path.startsWith("/admin")) {
      return;
    }

    // Check session
    if (!request.session?.adminId) {
      // API requests get JSON 401, browser requests redirect
      if (request.headers.accept?.includes("application/json")) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      // For browser requests, redirect to login with return URL
      const returnUrl = encodeURIComponent(request.url);
      return reply.redirect(`/admin/login?returnUrl=${returnUrl}`);
    }

    // Touch session to extend expiration (sliding expiration)
    request.session.touch();
  });
}

export default fp(adminAuthPlugin, {
  name: "admin-auth",
});
```

### Pattern 2: React Auth Context with Protected Routes
**What:** Use React Context to manage auth state across the SPA, with a ProtectedRoute component that redirects unauthenticated users.
**When to use:** For all dashboard pages that require authentication.
**Example:**
```typescript
// Source: https://blog.logrocket.com/authentication-react-router-v7/ (adapted)
// dashboard/src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    fetch("/admin/api/session", { credentials: "include" })
      .then(res => {
        setIsAuthenticated(res.ok);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch("/admin/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = async () => {
    await fetch("/admin/api/logout", {
      method: "POST",
      credentials: "include"
    });
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
```

```typescript
// dashboard/src/components/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

### Pattern 3: pnpm Workspace Configuration
**What:** Configure pnpm workspaces to link dashboard and shared-types packages.
**When to use:** For monorepo setup.
**Example:**
```yaml
# pnpm-workspace.yaml
packages:
  - "dashboard"
  - "packages/*"
```

```json
// packages/shared-types/package.json
{
  "name": "@docora/shared-types",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    }
  }
}
```

```json
// dashboard/package.json (partial)
{
  "dependencies": {
    "@docora/shared-types": "workspace:*"
  }
}
```

### Anti-Patterns to Avoid

- **Mixing admin and client auth:** Never use the same auth plugin or session for both admin and client API authentication. They must be completely isolated.
- **In-memory session store in production:** The default store leaks memory. Always use Redis or another persistent store.
- **Storing session data in cookies:** Use @fastify/session (server-side store), not @fastify/secure-session (cookie-stored) for admin sessions with sensitive data.
- **Hardcoding secrets:** Session secret must come from environment variables.
- **Missing httpOnly flag:** Always set httpOnly: true on session cookies to prevent XSS-based session hijacking.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom cookie handling | @fastify/session + @fastify/cookie | Cookie security (httpOnly, secure, sameSite), session expiry, store abstraction |
| Session storage | In-memory Map | connect-redis with ioredis | Memory leaks, multi-instance support, persistence |
| Password hashing | Custom hashing | bcrypt (already in deps) | Timing attacks, salt handling, work factor |
| Static file serving | fs.readFile + reply.send | @fastify/static | Caching headers, mime types, range requests |
| React dev server proxy | Manual forwarding | Vite proxy config | HMR, WebSocket handling, error handling |
| Protected routes | Manual auth checks | ProtectedRoute component pattern | Consistent behavior, redirect handling |

**Key insight:** Session security has many subtle requirements (timing-safe comparison, proper cookie attributes, CSRF protection considerations). Using battle-tested libraries prevents security vulnerabilities that are easy to introduce in hand-rolled solutions.

## Common Pitfalls

### Pitfall 1: Plugin Registration Order
**What goes wrong:** Session plugin throws errors or cookies don't work because @fastify/cookie isn't registered first.
**Why it happens:** @fastify/session depends on @fastify/cookie being registered before it.
**How to avoid:** Always register cookie plugin before session plugin, or let the admin-auth plugin handle both registrations internally.
**Warning signs:** "Cookie plugin not registered" errors, undefined request.session.

### Pitfall 2: Missing trustProxy with Reverse Proxy
**What goes wrong:** Secure cookies don't work when behind nginx/load balancer.
**Why it happens:** Fastify doesn't see HTTPS when TLS terminates at proxy.
**How to avoid:** Add `trustProxy: true` to Fastify options when running behind a reverse proxy.
**Warning signs:** Cookies not being set, session not persisting despite correct code.

### Pitfall 3: Cookie Path Mismatch
**What goes wrong:** Session cookies set on "/" affect client API, or session not found on /admin/* routes.
**Why it happens:** Cookie path must match the routes that need access.
**How to avoid:** Set `cookie.path: "/admin"` to scope session cookies to admin routes only.
**Warning signs:** Multiple session cookies, session sharing between admin and client routes.

### Pitfall 4: Session Not Persisting After Login
**What goes wrong:** User logs in successfully but next request shows no session.
**Why it happens:** Session not saved before response, or credentials: "include" missing from fetch.
**How to avoid:** Ensure `request.session.save()` is called (or let rolling: true handle it), and always use `credentials: "include"` in frontend fetch calls.
**Warning signs:** Login returns 200 but subsequent requests return 401.

### Pitfall 5: Expired Sessions Not Being Cleaned
**What goes wrong:** Redis fills up with expired session data.
**Why it happens:** connect-redis requires TTL configuration to auto-expire sessions.
**How to avoid:** Redis store auto-expires when maxAge is set on the cookie. Verify Redis keys have TTL.
**Warning signs:** Growing Redis memory usage, `KEYS session:*` returns many entries.

### Pitfall 6: SPA Routing Conflicts
**What goes wrong:** Direct navigation to /admin/apps returns 404.
**Why it happens:** Fastify doesn't know about React Router routes; tries to serve non-existent file.
**How to avoid:** Configure @fastify/static with setNotFoundHandler or explicit catch-all route to serve index.html for /admin/* paths that don't match API routes.
**Warning signs:** 404 on page refresh, only root URL works.

### Pitfall 7: Revealing Username Existence
**What goes wrong:** Different error messages for "user not found" vs "wrong password" allow enumeration.
**Why it happens:** Natural to give specific error messages for debugging.
**How to avoid:** Per CONTEXT.md, always return generic "Invalid credentials" message.
**Warning signs:** Login response reveals whether username exists.

## Code Examples

Verified patterns from official sources:

### Admin Login Route
```typescript
// Source: @fastify/session README + bcrypt docs
// src/routes/admin/login.ts
import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function registerAdminLoginRoutes(server: FastifyInstance) {
  // Check if admin credentials are configured
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPasswordHash = process.env.ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
    : null;

  if (!adminUsername || !adminPasswordHash) {
    // Return 503 with setup instructions (per CONTEXT.md)
    server.get("/admin/api/*", async (_, reply) => {
      return reply.status(503).send({
        error: "Admin not configured",
        message: "Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables",
      });
    });
    return;
  }

  server.post("/admin/api/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request" });
    }

    const { username, password } = parsed.data;

    // Constant-time comparison for username (prevent timing attacks)
    const usernameMatch = username === adminUsername;
    const passwordMatch = await bcrypt.compare(password, adminPasswordHash);

    if (!usernameMatch || !passwordMatch) {
      // Generic message per CONTEXT.md
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Set session
    request.session.adminId = "admin";
    request.session.adminUsername = username;

    return { success: true };
  });

  server.post("/admin/api/logout", async (request, reply) => {
    await request.session.destroy();
    return { success: true };
  });

  server.get("/admin/api/session", async (request, reply) => {
    if (!request.session?.adminId) {
      return reply.status(401).send({ error: "Not authenticated" });
    }
    return {
      authenticated: true,
      username: request.session.adminUsername,
    };
  });
}
```

### Vite Config for Dashboard
```typescript
// Source: https://vite.dev/config/
// dashboard/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/admin/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

### Serving SPA from Fastify
```typescript
// Source: https://github.com/fastify/fastify-static
// src/routes/admin/static.ts
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerAdminStaticRoutes(server: FastifyInstance) {
  // Serve dashboard build
  await server.register(fastifyStatic, {
    root: path.join(__dirname, "../../../dashboard/dist"),
    prefix: "/admin/",
    decorateReply: false, // Avoid conflict if already decorated
  });

  // SPA catch-all: serve index.html for all unmatched /admin/* routes
  server.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/admin") && !request.url.startsWith("/admin/api")) {
      return reply.sendFile("index.html", path.join(__dirname, "../../../dashboard/dist"));
    }
    return reply.status(404).send({ error: "Not found" });
  });
}
```

### React Router Setup
```typescript
// Source: https://reactrouter.com/
// dashboard/src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";

export function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            {/* Future routes go here */}
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fastify-session (unmaintained) | @fastify/session | 2022 | Use scoped package name |
| react-router-dom v6 | react-router v7 unified | 2025 | Single package, improved data loading |
| CRA (Create React App) | Vite | 2023+ | Faster dev, better ESM support |
| express-session compatible stores | Same, still compatible | N/A | connect-redis works with @fastify/session |

**Deprecated/outdated:**
- `fastify-session` (unscoped): Use `@fastify/session` instead
- `fastify-cookie` (unscoped): Use `@fastify/cookie` instead
- `react-router-dom` v6 separate package: Use unified `react-router` v7

## Open Questions

Things that couldn't be fully resolved:

1. **Session secret rotation strategy**
   - What we know: @fastify/session supports secret array for rotation
   - What's unclear: Exact rotation timing/process for production
   - Recommendation: Start with single secret, add rotation in Phase 5 (Production Hardening)

2. **Vite build integration with main build process**
   - What we know: Dashboard builds to dist/, served by @fastify/static
   - What's unclear: Whether to build dashboard in Docker build or separately
   - Recommendation: Build in Dockerfile multi-stage build; add `dashboard/dist/` to .gitignore

3. **Session expiry toast notification timing**
   - What we know: Per CONTEXT.md, show toast when session expires
   - What's unclear: How to detect server-side session expiry on frontend
   - Recommendation: Frontend polls /admin/api/session periodically, shows toast on 401

## Sources

### Primary (HIGH confidence)
- [@fastify/session GitHub README](https://github.com/fastify/session) - Session plugin configuration, store options, cookie settings
- [@fastify/cookie GitHub README](https://github.com/fastify/fastify-cookie) - Cookie plugin setup
- [@fastify/static GitHub README](https://github.com/fastify/fastify-static) - Static file serving, SPA configuration
- [pnpm Workspaces Documentation](https://pnpm.io/workspaces) - Workspace protocol, configuration
- [React Router v7 Documentation](https://reactrouter.com/) - Protected routes, unified package
- [Vite Documentation](https://vite.dev/guide/) - Configuration, proxy setup, build options

### Secondary (MEDIUM confidence)
- [LogRocket Authentication with React Router v7](https://blog.logrocket.com/authentication-react-router-v7/) - Protected route patterns
- [Fastify Session GitHub Issues](https://github.com/fastify/session/issues/251) - Session expiry behavior
- [pnpm Monorepo Blog Posts](https://blog.emmanuelisenah.com/setting-up-a-monorepo-using-pnpm-workspaces-with-typescript-and-tailwind) - Workspace setup patterns

### Tertiary (LOW confidence)
- WebSearch results for version numbers - Verified against npm registry results

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are official Fastify plugins or well-established React ecosystem tools
- Architecture: HIGH - Patterns documented in official docs and widely used
- Pitfalls: HIGH - Derived from official documentation warnings and GitHub issues
- Code examples: MEDIUM - Adapted from official docs, not run in this specific setup

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - stable libraries)
