# Pitfalls Research

**Domain:** React Admin Dashboard for Existing Fastify/TypeScript Backend
**Researched:** 2026-01-26
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Mixing Admin Routes with Client API Authentication

**What goes wrong:**
The existing auth plugin uses Bearer tokens validated against the `apps` table. Adding admin routes that use username/password authentication creates two authentication systems that can conflict. Routes may accidentally use the wrong auth mechanism, or the admin auth may inadvertently expose client API endpoints.

**Why it happens:**
Developers add admin routes to the existing route tree without properly isolating them. The global `onRequest` hook in `auth.ts` checks every request, and mixing authentication strategies in the same request lifecycle leads to confusion.

**How to avoid:**
- Create a dedicated `/admin/*` route prefix with its own authentication plugin
- Use Fastify's encapsulation: register admin routes in a separate plugin scope with its own `onRequest` hook
- Never share authentication context between client API and admin routes
- Consider separate Fastify instances if complexity grows

**Warning signs:**
- Auth errors appear inconsistently (sometimes 401, sometimes works)
- Client API tokens accidentally grant admin access
- Admin authentication leaks into client routes

**Phase to address:**
Phase 1 (Foundation) - Set up proper route isolation before building any admin features

---

### Pitfall 2: Exposing Internal Data Without Proper Isolation

**What goes wrong:**
Admin dashboards expose internal data (BullMQ jobs, error logs, database records) through new API endpoints. Without proper isolation, these internal endpoints can be discovered or accessed by external clients, leaking sensitive system information.

**Why it happens:**
Developers add `/api/admin/jobs` endpoints to the same Fastify instance that serves `/api/repositories`. Even with authentication, misconfiguration or forgotten endpoints can expose internal state. The existing rate-limit (100/minute) and CORS (`origin: "*"`) settings may not be appropriate for admin endpoints.

**How to avoid:**
- Use a completely separate route prefix (`/admin/api/*`) that is explicitly blocked at ingress/proxy level for external access
- Implement defense in depth: authentication + IP allowlist + CORS restriction for admin routes
- Never return raw database/queue data - always transform through DTOs that hide internal structure
- Consider running admin dashboard on a separate port or subdomain

**Warning signs:**
- Internal IDs, queue names, or error stack traces visible in network tab
- Admin endpoints accessible without authentication (even if empty)
- Same CORS settings for admin and client APIs

**Phase to address:**
Phase 1 (Foundation) - Design API isolation architecture before implementing endpoints

---

### Pitfall 3: Frontend-Backend Module System Mismatch

**What goes wrong:**
Docora uses ES Modules (`"type": "module"`) with TypeScript. Adding a React frontend (typically using Vite, also ESM) seems compatible, but shared type packages or attempting to import backend code from frontend causes compilation failures or runtime errors.

**Why it happens:**
Even though both use ESM, path resolution differs. The backend uses `.js` extensions for imports (TypeScript ESM convention), while Vite resolves differently. Shared packages must be configured to work with both bundlers, and incorrect `tsconfig.json` paths or package.json exports cause silent failures.

**How to avoid:**
- Keep frontend completely separate - no imports from backend source code
- If sharing types, create a dedicated `/packages/shared-types` workspace package with proper dual-export configuration
- Use pnpm workspace protocol (`workspace:*`) for local dependencies
- Test type sharing early with a minimal example before building features

**Warning signs:**
- TypeScript errors about module resolution or missing exports
- Vite build fails but tsc succeeds (or vice versa)
- "Cannot find module" errors that reference backend paths

**Phase to address:**
Phase 1 (Foundation) - Establish monorepo structure with proper workspace configuration

---

### Pitfall 4: Serving SPA from Fastify Without Proper Routing

**What goes wrong:**
React SPAs use client-side routing (e.g., `/admin/jobs` vs `/admin/errors`). When serving the SPA from Fastify using `@fastify/static`, refreshing the page on a client route returns 404 because Fastify looks for `/admin/jobs/index.html` which doesn't exist.

**Why it happens:**
`@fastify/static` serves files as-is. Unlike Express's common pattern of `app.get('/*', sendFile('index.html'))`, Fastify requires explicit configuration for SPA fallback behavior.

**How to avoid:**
- Configure `@fastify/static` with `setNotFoundHandler` to return `index.html` for admin routes
- Alternatively, use `@fastify/view` with explicit fallback route
- Test navigation AND page refresh for all admin routes during development
- Consider serving frontend from CDN/nginx in production, only proxying API calls to Fastify

**Warning signs:**
- Navigation works but refresh returns 404
- Deep links to admin pages break
- Browser shows raw JSON error instead of app

**Phase to address:**
Phase 2 (Core Implementation) - When integrating built frontend with Fastify

---

### Pitfall 5: Real-time Dashboard Updates Causing Performance Issues

**What goes wrong:**
Admin dashboards showing BullMQ job status need real-time updates. Naive implementations poll the API every second, creating database/Redis load. Or they use WebSockets but don't limit state updates, causing React to re-render constantly and the browser to lag.

**Why it happens:**
"Real-time" is implemented as aggressive polling without considering the cost. Each poll hits BullMQ/Redis, and the response triggers React state updates. With multiple dashboard tabs or users, this multiplies quickly.

**How to avoid:**
- Use reasonable polling intervals (5-10 seconds for job lists, faster only for active job detail view)
- Implement request deduplication (if refresh is already in-flight, skip new request)
- Use React Query or SWR for automatic caching and deduplication
- Batch state updates - update once after processing all events, not per-event
- Consider Server-Sent Events (SSE) instead of polling for truly real-time needs

**Warning signs:**
- Network tab shows constant requests even on idle dashboard
- CPU usage high when dashboard tab is open
- Multiple users cause backend slowdown
- React DevTools shows constant re-renders

**Phase to address:**
Phase 3 (Data Display) - When implementing job/error list views

---

### Pitfall 6: Admin Auth Stored Insecurely in Frontend

**What goes wrong:**
Simple username/password admin auth results in credentials or session tokens stored in localStorage. This is vulnerable to XSS attacks. A single XSS vulnerability anywhere in the admin app exposes all admin credentials.

**Why it happens:**
localStorage is convenient and persists across tabs. Developers store JWT tokens there without considering that any JavaScript running on the page can read localStorage.

**How to avoid:**
- Use httpOnly cookies for session tokens (not readable by JavaScript)
- If using localStorage, implement short-lived tokens with refresh via httpOnly cookie
- Implement Content Security Policy (CSP) headers to mitigate XSS
- Consider session-based auth for admin (simpler and more secure than JWT for single-app use)

**Warning signs:**
- Tokens visible in localStorage via browser DevTools
- No CSP headers on admin pages
- Long-lived tokens (days/weeks) in browser storage

**Phase to address:**
Phase 1 (Foundation) - Authentication implementation

---

### Pitfall 7: Breaking Existing Client API While Adding Admin Features

**What goes wrong:**
Changes to support admin dashboard (new middleware, database schema changes, shared code modifications) accidentally break the existing client-facing API. Existing integrations fail, webhooks stop working.

**Why it happens:**
Admin and client code share infrastructure: database connection, Redis connection, Fastify plugins. A "harmless" change for admin features has ripple effects. No regression tests for client API behavior.

**How to avoid:**
- Maintain comprehensive API tests for all existing endpoints before starting admin work
- Run full test suite after every admin-related change
- Use feature flags to isolate admin functionality during development
- Add contract tests or snapshot tests for API responses

**Warning signs:**
- Existing tests start failing after admin changes
- Client apps report errors after deployments
- API response shapes change unexpectedly

**Phase to address:**
Phase 0 (Pre-work) - Ensure test coverage for existing API before starting admin dashboard

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Querying database directly in route handlers | Fast to implement | Tight coupling, hard to test, duplicated logic | Never - use existing repository pattern |
| Embedding admin auth credentials in env vars | Simple setup | No user management, password rotation requires redeploy | MVP only - plan migration path |
| Polling every second | Feels "real-time" | Backend load, browser CPU, poor UX | Never - 5+ second intervals with smart refresh |
| Single shared `types.ts` file | Easy type sharing | Grows unwieldy, forces frontend rebuild on backend changes | Early phase only - split when > 50 types |
| Inline CSS/Tailwind everywhere | Fast styling | Inconsistent design, hard to maintain | Prototype only - establish design system early |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| BullMQ job display | Fetching all jobs without pagination | Use BullMQ's `getJobs()` with start/end limits; implement cursor-based pagination |
| Error log display | Loading full error stack traces for list view | Summary in list, full details on click; truncate in API response |
| Redis connection | Creating new connection per request | Reuse existing `src/queue/connection.ts` connection pool |
| Fastify static serving | Serving from project root | Use absolute path, serve only `/dist` or `/public` directories |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all jobs on dashboard load | Initial load takes seconds | Paginate, load only first page, lazy-load rest | > 1,000 jobs in queue |
| Fetching full error objects | Slow list rendering, high memory | Fetch summaries, expand on demand | > 100 errors with stack traces |
| No debouncing on search/filter | API hammered during typing | Debounce 300ms, cancel pending requests | Any real user interaction |
| Storing all dashboard state in React | Memory grows, slow transitions | Use URL state for filters/pagination, server state for data | > 10 dashboard views visited |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Admin routes without authentication during development | Accidental production deployment without auth | Add auth from day one, use env flag only for development bypass |
| Exposing internal job IDs/Redis keys | Information disclosure enabling targeted attacks | Transform all internal identifiers before returning to frontend |
| Same-origin admin and client API | XSS on client could compromise admin | Consider subdomains: `admin.docora.io` vs `api.docora.io` |
| No rate limiting on admin auth | Brute force password attacks | Aggressive rate limit on admin login (5 attempts/minute) |
| CORS `origin: "*"` for admin endpoints | Cross-origin attacks possible | Explicit origin allowlist for admin routes |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading states | Users click multiple times, confused about status | Skeleton loaders for lists, spinners for actions |
| Silent failures | Users think action succeeded when it failed | Toast notifications with clear success/error messages |
| Full page reload on action | Lose context, slow feedback | Optimistic updates with rollback on failure |
| No empty states | Users confused by blank screens | Helpful empty states: "No failed jobs - all systems operational" |
| Overly detailed error messages | Confusion, security risk (stack traces) | User-friendly messages in UI, technical details in logs |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Job list view:** Often missing retry/delete actions - verify CRUD operations work
- [ ] **Authentication:** Often missing session expiry - verify timeout and re-login flow
- [ ] **Error display:** Often missing copy-to-clipboard - verify debugging workflow
- [ ] **Pagination:** Often missing edge cases - verify first page, last page, empty results
- [ ] **Real-time updates:** Often missing reconnection - verify behavior after network interruption
- [ ] **Responsive design:** Often broken on tablets - verify admin used on laptop screens
- [ ] **Logout:** Often missing token cleanup - verify tokens removed from storage and invalidated server-side

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Auth systems mixed up | MEDIUM | Separate into distinct plugins, update all routes, test both paths |
| Internal data exposed | MEDIUM | Audit all admin endpoints, add DTO layer, rotate any leaked secrets |
| SPA routing broken | LOW | Add fallback handler to Fastify, redeploy |
| Performance issues from polling | LOW | Reduce frequency, add React Query, may need backend caching layer |
| Client API broken by admin changes | HIGH | Revert deployment, fix issues, add missing tests, redeploy |
| Security breach via admin | CRITICAL | Rotate all credentials, audit access logs, security review |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Auth system mixing | Phase 1 (Foundation) | Separate route prefixes, distinct auth hooks |
| Internal data exposure | Phase 1 (Foundation) | DTO layer defined, CORS restricted |
| Module system mismatch | Phase 1 (Foundation) | Sample type import works from frontend |
| SPA routing | Phase 2 (Integration) | Page refresh works on all admin routes |
| Real-time performance | Phase 3 (Features) | Dashboard open for 5 min without CPU spike |
| Token storage security | Phase 1 (Foundation) | Tokens in httpOnly cookies or short-lived |
| Client API regression | Pre-Phase 0 | Existing API test coverage > 80% |

## Sources

- [Common Mistakes in React Admin Dashboards - DEV Community](https://dev.to/vaibhavg/common-mistakes-in-react-admin-dashboards-and-how-to-avoid-them-1i70)
- [React Security: Vulnerabilities & Best Practices 2026](https://www.glorywebs.com/blog/react-security-practices)
- [The power of the monorepo: Keep your fullstack app in sync!](https://www.highlight.io/blog/keeping-your-frontend-and-backend-in-sync-with-a-monorepo)
- [Sharing Types in PNPM Monorepo - DEV Community](https://dev.to/lico/step-by-step-guide-sharing-types-and-values-between-react-esm-and-nestjs-cjs-in-a-pnpm-monorepo-2o2j)
- [API endpoint configuration recommendations - OpenStack Security Guide](https://docs.openstack.org/security-guide/api-endpoints/api-endpoint-configuration-recommendations.html)
- [The State of API Security in 2026](https://www.appsecure.security/blog/state-of-api-security-common-misconfigurations)
- [Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query)
- [Bull-Board GitHub Repository](https://github.com/felixmosh/bull-board)
- [Fastify Static Plugin GitHub](https://github.com/fastify/fastify-static)
- [React-admin Security Guide](https://marmelab.com/react-admin/SecurityGuide.html)
- [Sam Newman - Backends For Frontends Pattern](https://samnewman.io/patterns/architectural/bff/)

---
*Pitfalls research for: React Admin Dashboard on Fastify/TypeScript Backend*
*Researched: 2026-01-26*
