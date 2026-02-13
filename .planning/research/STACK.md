# Stack Research

**Domain:** React Admin Dashboard for Fastify Backend (Monorepo Integration)
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

For adding an admin monitoring dashboard to Docora (existing Fastify/TypeScript/PostgreSQL backend), the recommended stack is **Vite + React 19 + shadcn/ui + TanStack Query/Table** served via `@fastify/static`. This stack aligns with the existing pnpm-based project and provides modern, type-safe tooling with excellent developer experience.

Key principles:
- **Custom dashboard over framework** - react-admin/refine are overkill for a simple monitoring dashboard
- **Headless components** - shadcn/ui provides flexibility without vendor lock-in
- **TanStack ecosystem** - Query for data fetching, Table for data grids, unified approach
- **Monorepo via pnpm workspaces** - Leverages existing pnpm setup

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| React | ^19.2.0 | UI framework | Latest stable with concurrent rendering, Activity component for performance. React 19.2.3 released Dec 2025. | HIGH |
| Vite | ^6.0.0 | Build tool | 5x faster builds than v5, first-party plugin ecosystem, replaced CRA as standard. Tailwind v4 has native Vite plugin. | HIGH |
| TypeScript | ^5.9.0 | Type safety | Already in Docora (5.9.3). Zod v4 tested against TS 5.5+. | HIGH |
| Tailwind CSS | ^4.0.0 | Styling | CSS-first config (no JS config file), Oxide engine 100x faster incremental builds. Released Jan 2025. | HIGH |
| shadcn/ui | latest | UI components | Not a dependency - copies component source into project. Built on Radix primitives + Tailwind. Full ownership/customization. | HIGH |

### Data Layer

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| TanStack Query | ^5.90.0 | Server state | De facto standard for async data. Auto-caching, background refetch, devtools. v5.90.20 released Jan 2025. | HIGH |
| TanStack Table | ^8.21.0 | Data tables | Headless table with sorting, filtering, pagination. shadcn/ui uses this for data-table component. v8.21.3 released Apr 2025. | HIGH |
| Zustand | ^5.0.10 | Client state | Minimal API, ~2KB. Perfect for UI state (sidebar open, theme). Use with TanStack Query for server state. Released Jan 2025. | HIGH |

### Form & Validation

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| React Hook Form | ^7.54.0 | Form handling | Uncontrolled inputs = minimal re-renders. Works seamlessly with shadcn/ui Form component. | HIGH |
| Zod | ^4.3.0 | Schema validation | Already in Docora backend. Share schemas between frontend/backend for type safety. | HIGH |
| @hookform/resolvers | ^5.0.0 | RHF + Zod glue | Official integration, automatic type inference from Zod schemas. | HIGH |

### Visualization

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Recharts | ^3.0.0 | Charts | React-native, SVG-based, composable. v3.0 (mid-2025) improved TypeScript + accessibility. Ideal for admin dashboards with moderate data. | MEDIUM |
| Lucide React | ^0.562.0 | Icons | Used by shadcn/ui. 1,667 tree-shakable icons. Clean, consistent aesthetic. | HIGH |

### Backend Integration

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| @fastify/static | ^8.1.0 | Serve SPA | Serves dashboard build from `/admin`. Compatible with Fastify 5.x. Configure wildcard for SPA routing. | HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Testing | Already in Docora. Use for dashboard component tests. |
| @vitejs/plugin-react-swc | React compilation | SWC-based, faster than Babel alternative. |
| eslint + prettier | Code quality | Extend existing Docora config. |

## Installation

```bash
# In monorepo root, create workspace config
# pnpm-workspace.yaml:
# packages:
#   - 'dashboard'

# Create dashboard app
cd /home/toto/scm-projects/docora
pnpm create vite dashboard --template react-swc-ts

# Core dependencies (from dashboard directory)
cd dashboard
pnpm add react@^19.2.0 react-dom@^19.2.0
pnpm add @tanstack/react-query@^5.90.0
pnpm add @tanstack/react-table@^8.21.0
pnpm add zustand@^5.0.10
pnpm add react-hook-form@^7.54.0
pnpm add @hookform/resolvers@^5.0.0
pnpm add zod@^4.3.0
pnpm add recharts@^3.0.0
pnpm add lucide-react@^0.562.0

# Tailwind CSS v4
pnpm add -D tailwindcss@^4.0.0

# shadcn/ui (run init command, copies components)
pnpm dlx shadcn@latest init

# Dev dependencies
pnpm add -D @types/react@^19.0.0 @types/react-dom@^19.0.0
pnpm add -D @vitejs/plugin-react-swc@^3.8.0
pnpm add -D vitest@^4.0.0 @testing-library/react@^16.0.0

# Backend: serve dashboard
cd ..
pnpm add @fastify/static@^8.1.0
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom + shadcn/ui | react-admin | Enterprise apps needing RBAC, i18n, audit logs out-of-box. Overkill for simple monitoring. |
| Custom + shadcn/ui | Refine | Multi-backend apps, SSR requirements, larger teams. More opinionated than needed here. |
| Recharts | Chart.js (react-chartjs-2) | Need canvas rendering for 10K+ data points. Bundle size critical (11KB vs larger). |
| Recharts | Tremor | Want pre-styled dashboard components. Less flexible, more opinionated. |
| TanStack Router | React Router | Already familiar with React Router, simple routing needs. TanStack Router better for type-safe complex routing. |
| Zustand | Redux Toolkit | Complex state with time-travel debugging, large team needing strict patterns. |
| Zustand | React Context | Very simple state, no need for selectors/middleware. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Create React App (CRA) | Deprecated, no longer maintained. Slow builds. | Vite |
| Material-UI (MUI) | Large bundle, opinionated styling conflicts with Tailwind. License concerns for some. | shadcn/ui + Tailwind |
| Ant Design | Heavy, enterprise-focused, complex theming. | shadcn/ui |
| Redux (plain) | Boilerplate-heavy, overkill for admin dashboard state. | Zustand |
| Axios | Docora already uses axios, but for new dashboard prefer native fetch with TanStack Query. | fetch + TanStack Query |
| localStorage for auth | XSS vulnerable. | HttpOnly cookies |
| react-table v7 | Unmaintained. | @tanstack/react-table v8 |

## Monorepo Structure

```
docora/
├── src/                      # Existing Fastify backend
├── dashboard/                # New React admin dashboard
│   ├── src/
│   │   ├── components/       # shadcn/ui + custom components
│   │   ├── hooks/            # Custom hooks
│   │   ├── lib/              # Utilities (cn, api client)
│   │   ├── pages/            # Route pages
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── package.json              # Root package.json
├── pnpm-workspace.yaml       # NEW: workspace config
└── tsconfig.base.json        # NEW: shared TS config
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'dashboard'
```

### Root package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:dashboard": "pnpm --filter dashboard dev",
    "build": "tsc && pnpm --filter dashboard build",
    "build:dashboard": "pnpm --filter dashboard build"
  }
}
```

## Authentication Pattern

For a simple single-admin dashboard:

**Recommended: Session cookie with httpOnly flag**

```
1. POST /api/admin/login { username, password }
   - Validate credentials (bcrypt - already in Docora)
   - Set httpOnly, secure, sameSite=strict cookie with session token
   - Return { success: true }

2. All /api/admin/* routes check session cookie
   - Fastify preHandler hook validates session
   - 401 if invalid/expired

3. Dashboard checks auth on load
   - TanStack Query fetches /api/admin/me
   - Redirect to /login if 401
```

**Why not JWT in localStorage:**
- XSS attack can steal token
- HttpOnly cookies cannot be accessed by JavaScript
- Session cookies automatically sent with requests

## Fastify Static Configuration

```typescript
// src/plugins/admin-static.ts
import fastifyStatic from '@fastify/static';
import path from 'path';

export async function registerAdminStatic(fastify: FastifyInstance) {
  // Serve dashboard build
  await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), 'dashboard', 'dist'),
    prefix: '/admin/',
    decorateReply: false, // Avoid conflict if already registered
  });

  // SPA fallback - serve index.html for client-side routes
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/admin')) {
      return reply.sendFile('index.html', path.join(process.cwd(), 'dashboard', 'dist'));
    }
    // ... existing 404 handling
  });
}
```

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| React 19.2 | TanStack Query 5.x | Works, may not work with React Compiler yet |
| React 19.2 | TanStack Table 8.x | Works, compiler compatibility pending |
| Tailwind 4.0 | Vite 6.x | Native @tailwindcss/vite plugin |
| shadcn/ui | Tailwind 4.0 | Updated docs for v4 compatibility |
| Zod 4.x | TypeScript 5.5+ | Tested and compatible |
| Fastify 5.x | @fastify/static 8.x | Verified compatible |

## Sources

### Official Documentation (HIGH confidence)
- [React 19.2 Release Notes](https://react.dev/blog/2025/10/01/react-19-2) - Activity component, useEffectEvent
- [Vite Getting Started](https://vite.dev/guide/) - Templates, configuration
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) - CSS-first config, Oxide engine
- [shadcn/ui](https://ui.shadcn.com/) - Component installation, data-table guide
- [TanStack Query](https://tanstack.com/query/latest) - v5 features, Suspense support
- [TanStack Table](https://tanstack.com/table/latest) - Headless table API
- [Zustand](https://zustand.docs.pmnd.rs/) - Store patterns
- [@fastify/static GitHub](https://github.com/fastify/fastify-static) - SPA configuration

### Package Registries (HIGH confidence)
- @tanstack/react-query: 5.90.20 (Jan 2025)
- @tanstack/react-table: 8.21.3 (Apr 2025)
- zustand: 5.0.10 (Jan 2025)
- lucide-react: 0.562.0 (Dec 2025)

### Community Resources (MEDIUM confidence)
- [TanStack Suite Guide 2025](https://andrewbaisden.medium.com/how-to-build-modern-react-apps-with-the-tanstack-suite-in-2025-ba335f3e59f9)
- [pnpm Monorepo Tutorial](https://dev.to/lico/react-monorepo-setup-tutorial-with-pnpm-and-vite-react-project-ui-utils-5705)
- [Recharts vs Chart.js 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [JWT in Admin Apps](https://marmelab.com/blog/2020/07/02/manage-your-jwt-react-admin-authentication-in-memory.html)
- [React State Management 2025](https://www.developerway.com/posts/react-state-management-2025)

---
*Stack research for: Docora Admin Dashboard*
*Researched: 2026-01-26*
