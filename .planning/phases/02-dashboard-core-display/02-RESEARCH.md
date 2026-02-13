# Phase 2: Dashboard Integration & Core Display - Research

**Researched:** 2026-01-29
**Domain:** React dashboard with data fetching, polling, and monitoring UI
**Confidence:** HIGH

## Summary

Phase 2 requires building a monitoring dashboard UI with sidebar navigation, data fetching with auto-polling, and displays for apps, repositories, notifications, and job queue status. The existing project uses React 19, React Router 7, and inline styles. The decision context specifies 10-second polling, card-based layouts, and toast notifications for errors.

The recommended approach is to add TanStack Query for data fetching/polling, Lucide React for icons, react-hot-toast for notifications, and date-fns for relative timestamps. CSS Modules provide scoped styling with full CSS power while maintaining the project's TypeScript-first approach.

**Primary recommendation:** Use TanStack Query with `refetchInterval: 10000` and `refetchIntervalInBackground: true` for polling, React Router's nested `<Outlet>` pattern for layout structure, and CSS Modules for component styling.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | ^5.x | Data fetching & caching | De facto standard for React server state, handles polling natively |
| react-router | ^7.5.3 | Routing (already installed) | Already used in Phase 1, supports nested layouts |
| lucide-react | ^0.x | Icons | Lightweight, tree-shakeable, MIT licensed |
| react-hot-toast | ^2.x | Toast notifications | Lightweight (5kb), accessible, matches 5s auto-dismiss requirement |
| date-fns | ^3.x | Date formatting | Tree-shakeable, "X seconds ago" via formatDistanceToNow |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS Modules | (built-in) | Scoped component styles | All component styling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | SWR | TanStack has better polling support with `refetchIntervalInBackground` |
| CSS Modules | Tailwind CSS | Tailwind requires additional setup; CSS Modules already work in Vite |
| Lucide | Heroicons | Both are good; Lucide has more icons and smaller bundle |
| react-hot-toast | Sonner | Sonner is newer but react-hot-toast is more established |

**Installation:**
```bash
cd dashboard && pnpm add @tanstack/react-query lucide-react react-hot-toast date-fns
```

## Architecture Patterns

### Recommended Project Structure
```
dashboard/src/
├── components/           # Shared UI components
│   ├── Layout.tsx        # Main layout with sidebar + outlet
│   ├── Sidebar.tsx       # Navigation sidebar
│   ├── Card.tsx          # Reusable card component
│   ├── StatusBadge.tsx   # Status indicator (color + icon)
│   └── RefreshIndicator.tsx  # "Updated X seconds ago"
├── pages/
│   ├── Overview.tsx      # Key metrics + alerts
│   ├── Apps.tsx          # List of apps
│   ├── AppDetail.tsx     # Single app with repos/notifications
│   ├── Repositories.tsx  # All repositories
│   ├── Notifications.tsx # Failed notifications
│   └── Queue.tsx         # Job queue status
├── hooks/
│   └── usePolling.ts     # Shared polling configuration
├── api/
│   └── admin.ts          # API client functions
├── types/
│   └── dashboard.ts      # Dashboard-specific types
└── styles/
    └── *.module.css      # CSS Module files
```

### Pattern 1: Layout with Nested Routes
**What:** Parent route with sidebar that renders child routes via `<Outlet>`
**When to use:** Dashboard shell that persists across page navigation
**Example:**
```typescript
// Source: Context7 /remix-run/react-router
// App.tsx routes
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<ProtectedRoute />}>
    <Route element={<Layout />}>
      <Route index element={<Overview />} />
      <Route path="apps" element={<Apps />} />
      <Route path="apps/:appId" element={<AppDetail />} />
      <Route path="repositories" element={<Repositories />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="queue" element={<Queue />} />
    </Route>
  </Route>
</Routes>

// Layout.tsx
import { Outlet } from "react-router";
export function Layout() {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
```

### Pattern 2: Polling with TanStack Query
**What:** Auto-refresh data every 10 seconds, continue in background
**When to use:** All dashboard data fetching
**Example:**
```typescript
// Source: Context7 /websites/tanstack_query_v5
import { useQuery } from '@tanstack/react-query';

const POLL_INTERVAL = 10_000; // 10 seconds

export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: fetchApps,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: true, // Continue when tab hidden
  });
}
```

### Pattern 3: QueryClient Provider Setup
**What:** Configure QueryClient at app root
**When to use:** Required for TanStack Query
**Example:**
```typescript
// Source: Context7 /websites/tanstack_query_v5
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000, // Data fresh for 5s
      retry: 1,         // Single retry on failure
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* ... */}
    </QueryClientProvider>
  );
}
```

### Pattern 4: BullMQ Queue Status API
**What:** Backend endpoint to expose queue counts and job list
**When to use:** Queue page display
**Example:**
```typescript
// Source: Context7 /taskforcesh/bullmq
import { Queue } from 'bullmq';

const queue = new Queue('snapshot-queue', { connection });

// Get counts for dashboard
const counts = await queue.getJobCounts(
  'waiting', 'active', 'completed', 'failed', 'delayed'
);

// Get job details (first 50 of each state)
const waitingJobs = await queue.getWaiting(0, 50);
const activeJobs = await queue.getActive(0, 50);
```

### Anti-Patterns to Avoid
- **Syncing React Query data to state:** Don't copy `data` into `useState`; use the query result directly
- **Missing queryKey dependencies:** Include all fetch parameters in queryKey for proper cache invalidation
- **Forgetting refetchIntervalInBackground:** Polling pauses when tab is hidden without this option

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling logic | Custom setInterval | TanStack Query refetchInterval | Handles tab visibility, deduplication, caching |
| "5 minutes ago" text | Manual calculation | date-fns formatDistanceToNow | Handles edge cases, localization |
| Toast notifications | Custom component | react-hot-toast | Accessibility, animations, positioning |
| Loading states | Custom isLoading state | TanStack Query status | Handles refetching vs initial load |

**Key insight:** TanStack Query eliminates the entire category of "data fetching state management" bugs that plague custom solutions.

## Common Pitfalls

### Pitfall 1: Polling Stops When Tab Hidden
**What goes wrong:** Monitoring dashboard shows stale data when user switches tabs
**Why it happens:** Default TanStack Query behavior pauses polling on tab blur
**How to avoid:** Always set `refetchIntervalInBackground: true` for monitoring queries
**Warning signs:** Data appears stale after returning to tab

### Pitfall 2: Multiple Query States Racing
**What goes wrong:** UI flickers between loading and data states
**Why it happens:** Copying TanStack Query data to React state creates race conditions
**How to avoid:** Use query result directly: `const { data, isLoading, error } = useQuery(...)`
**Warning signs:** Inconsistent loading indicators, stale data appearing briefly

### Pitfall 3: Backend API Not Exposing Queue Status
**What goes wrong:** Frontend cannot display job counts
**Why it happens:** BullMQ queue methods require direct access to Queue instance
**How to avoid:** Create dedicated admin API endpoints that wrap BullMQ getters
**Warning signs:** "Queue status unavailable" errors

### Pitfall 4: CSS Modules Import Path
**What goes wrong:** Styles not applied, undefined className
**Why it happens:** Vite requires `.module.css` extension for CSS Modules
**How to avoid:** Use `Component.module.css` naming, import as `import styles from './Component.module.css'`
**Warning signs:** `styles.className` is undefined

### Pitfall 5: Lost Navigation State After Refresh
**What goes wrong:** Sidebar active state incorrect after page refresh
**Why it happens:** Not using React Router's `useLocation` for active detection
**How to avoid:** Check `location.pathname` against each menu item's path
**Warning signs:** Wrong menu item highlighted after direct URL navigation

## Code Examples

Verified patterns from official sources:

### Toast Notification for API Errors
```typescript
// Source: Context7 /websites/react-hot-toast
import toast from 'react-hot-toast';

// In API error handler
function handleApiError(error: Error) {
  toast.error(error.message, {
    duration: 5000, // 5 seconds as per requirements
  });
}

// Setup in App
import { Toaster } from 'react-hot-toast';
function App() {
  return (
    <>
      <Toaster position="top-right" />
      {/* ... */}
    </>
  );
}
```

### Relative Time Display
```typescript
// Source: Context7 /date-fns/date-fns
import { formatDistanceToNow } from 'date-fns';

function RefreshIndicator({ lastUpdated }: { lastUpdated: Date }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const update = () => {
      setText(formatDistanceToNow(lastUpdated, { addSuffix: true }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return <span>Updated {text}</span>;
}
```

### Status Badge Component
```typescript
// Source: Context7 /websites/lucide_dev_guide_packages
import { Check, X, Loader2 } from 'lucide-react';

type Status = 'success' | 'failed' | 'pending';

function StatusBadge({ status }: { status: Status }) {
  const config = {
    success: { icon: Check, color: 'green', label: 'Success' },
    failed: { icon: X, color: 'red', label: 'Failed' },
    pending: { icon: Loader2, color: 'yellow', label: 'Pending' },
  };
  const { icon: Icon, color, label } = config[status];

  return (
    <span className={styles[color]}>
      <Icon size={16} className={status === 'pending' ? styles.spin : ''} />
      {label}
    </span>
  );
}
```

### Shared Types (Backend + Frontend)
```typescript
// packages/shared-types/src/dashboard.ts
export interface AppSummary {
  app_id: string;
  app_name: string;
  base_url: string;
  created_at: string;
  repository_count: number;
  failed_notification_count: number;
}

export interface RepositorySummary {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  status: 'pending_snapshot' | 'scanning' | 'synced' | 'failed';
  last_scanned_at: string | null;
  circuit_open: boolean;
}

export interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface FailedNotification {
  app_id: string;
  app_name: string;
  repository_id: string;
  repository_name: string;
  error_message: string;
  timestamp: string;
  retry_count: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useEffect + useState for fetching | TanStack Query | 2022+ | Eliminates data fetching bugs |
| Redux for server state | TanStack Query | 2022+ | Simpler, automatic caching |
| moment.js for dates | date-fns | 2019+ | Tree-shakeable, smaller bundle |
| Custom toast system | react-hot-toast/Sonner | 2021+ | Better accessibility, easier |

**Deprecated/outdated:**
- `react-query` v3: Migrated to `@tanstack/react-query` v5
- CSS-in-JS runtime (styled-components): Build-time solutions preferred for performance

## Open Questions

Things that couldn't be fully resolved:

1. **Backend API endpoints for dashboard**
   - What we know: Need endpoints for apps list, repos list, queue status, notifications
   - What's unclear: Exact endpoint paths, authentication approach (session-based)
   - Recommendation: Use `/admin/api/` prefix with session auth (matches Phase 1)

2. **Notification history storage**
   - What we know: DASH-07 requires viewing sent update history
   - What's unclear: Whether this requires new database table or is derivable from existing data
   - Recommendation: Add `notification_history` table with event type, timestamp, status

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/tanstack_query_v5` - useQuery, refetchInterval, refetchIntervalInBackground
- Context7 `/remix-run/react-router` - Outlet, nested routes
- Context7 `/taskforcesh/bullmq` - getJobCounts, getWaiting, getActive, getFailed
- Context7 `/websites/react-hot-toast` - toast.error, duration, Toaster
- Context7 `/date-fns/date-fns` - formatDistanceToNow, format
- Context7 `/websites/lucide_dev_guide_packages` - icon components with props

### Secondary (MEDIUM confidence)
- [TanStack Query polling patterns](https://medium.com/@soodakriti45/tanstack-query-mastering-polling-ee11dc3625cb) - polling pitfalls
- [React admin dashboard patterns](https://dev.to/cristiansifuentes/building-a-collapsible-admin-sidebar-with-react-router-uselocation-pro-patterns-7im) - sidebar with useLocation

### Tertiary (LOW confidence)
- [CSS Modules vs Tailwind comparison](https://medium.com/@ignatovich.dm/css-modules-vs-css-in-js-vs-tailwind-css-a-comprehensive-comparison-24e7cb6f48e9) - styling approaches

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified through Context7 with official docs
- Architecture: HIGH - React Router outlet pattern and TanStack Query polling well-documented
- Pitfalls: MEDIUM - Based on combination of official docs and community patterns

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - stable ecosystem)
