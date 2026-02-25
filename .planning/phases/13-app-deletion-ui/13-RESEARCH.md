# Phase 13: App Deletion UI - Research

**Researched:** 2026-02-25
**Domain:** React dashboard UI -- confirmation dialogs, mutation hooks, API integration
**Confidence:** HIGH

## Summary

This phase adds the ability for admins to delete apps from the dashboard. The existing codebase provides nearly all the building blocks: a `ConfirmDialog` component, a `useAppActions` hook pattern, the `admin.ts` API layer, and a fully working backend `DELETE /admin/api/apps/:appId` endpoint. The main work is wiring these together with a few targeted enhancements.

Three gaps need closing: (1) the `ConfirmDialog` component needs a loading/disabled state to prevent double-clicks during the API call, (2) the `admin.ts` API layer needs a `deleteApi` helper function (currently only `fetchApi` and `postApi` exist -- there is no HTTP DELETE support), and (3) the confirmation dialog message requires snapshot and delivery counts, which are not currently returned by the app detail endpoint.

**Primary recommendation:** Enhance the existing `ConfirmDialog` to support loading state, add a `deleteApi` helper to `admin.ts`, enrich the backend app detail response with `snapshot_count` and `delivery_count`, then add deletion triggers to both the Apps list and AppDetail pages using a small custom hook or by extending `useAppActions`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Apps list page:** Trash icon button (lucide-react Trash2) per row, icon-only with tooltip "Delete app" on hover
- **App Detail page:** Red outlined button ("Delete App") in the header area next to the app name -- red border + red text, subtle until hovered
- Use existing `ConfirmDialog` component with `variant="danger"`
- Dialog title: "Delete App"
- Dialog message shows app name and actual counts: "This will permanently delete **{appName}** along with {N} repositories, {N} snapshots, and {N} deliveries."
- Counts sourced from enriched app detail data (add snapshot_count and delivery_count to existing app detail response)
- No type-to-confirm -- standard click confirmation
- Confirm button text: "Delete permanently"
- **From App Detail page:** Navigate to `/admin/apps` + success toast ("AppName deleted successfully")
- **From Apps list page:** Row removed in-place via React Query invalidation + success toast (stay on same page)
- **On error:** Red error toast with API error message, dialog stays open so user can retry or cancel
- **Loading state:** Spinner on "Delete permanently" button while API call in flight, both buttons disabled to prevent double-clicks

### Claude's Discretion
- Exact icon size and spacing in the list row
- CSS Module styling details for the outlined red button
- Toast message wording refinements
- How to structure the deletion mutation hook (likely extend useAppActions or create a new hook)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEL-03 | Admin can trigger app deletion from the dashboard with a confirmation dialog showing impact scope | All findings below: ConfirmDialog enhancement for loading state, deleteApi helper, enriched counts in AppDetail response, delete button placement on both pages, mutation hook pattern, navigation after deletion, React Query invalidation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.0.0 | UI framework | Already in project |
| @tanstack/react-query | ^5.90.20 | Server state, mutations, cache invalidation | Already in project; `useMutation` + `invalidateQueries` is the established pattern for all dashboard actions |
| react-hot-toast | ^2.6.0 | Toast notifications | Already used for success/error feedback across all actions |
| react-router | ^7.5.3 | Navigation (useNavigate) | Already used in Login page; needed for post-deletion redirect from AppDetail |
| lucide-react | ^0.563.0 | Icons (Trash2, Loader2) | Already used throughout dashboard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Date formatting | Already in project, not needed for this phase |

### Alternatives Considered
None -- all libraries are already in the project. No new dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
dashboard/src/
├── api/admin.ts              # Add deleteApi helper + deleteApp function
├── hooks/useAppActions.ts    # Add delete mutation (or new useAppDelete hook)
├── components/ConfirmDialog.tsx      # Enhance with loading/disabled props
├── components/ConfirmDialog.module.css  # No changes needed
├── pages/Apps.tsx            # Add Trash2 icon column + delete dialog state
├── pages/Apps.module.css     # Add deleteButton style
├── pages/AppDetail.tsx       # Add "Delete App" outlined button + delete dialog
├── pages/AppDetail.module.css # Add deleteAppButton style
packages/shared-types/src/
├── dashboard.ts              # Add snapshot_count, delivery_count to AppDetail
src/
├── routes/admin/dashboard-api-apps.ts  # Enrich detail response with counts
├── repositories/admin-dashboard.ts     # Add count queries
```

### Pattern 1: DELETE API Helper
**What:** The `admin.ts` API layer currently has `fetchApi` (GET) and `postApi` (POST) but no DELETE helper. Add a `deleteApi` function following the same pattern.
**When to use:** For the `DELETE /admin/api/apps/:appId` call.
**Example:**
```typescript
async function deleteApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`/admin${endpoint}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: "Unknown error",
    }))) as ApiErrorResponse;
    throw new ApiError(errorData.error, response.status);
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data.data;
}

export async function deleteApp(appId: string): Promise<DeleteAppResult> {
  return deleteApi<DeleteAppResult>(`/api/apps/${appId}`);
}
```

### Pattern 2: ConfirmDialog Loading State Enhancement
**What:** The current `ConfirmDialog` always renders static buttons. The user decision requires a loading spinner on the confirm button and both buttons disabled during the API call. Add optional `loading` prop.
**When to use:** When the dialog wraps an async mutation.
**Example:**
```typescript
interface ConfirmDialogProps {
  // ... existing props
  loading?: boolean;  // NEW: disables buttons, shows spinner on confirm
}

// In JSX:
<button
  className={styles.cancelButton}
  onClick={onCancel}
  disabled={loading}
>
  {cancelLabel}
</button>
<button
  className={`${styles.confirmButton} ${confirmClass}`}
  onClick={onConfirm}
  disabled={loading}
>
  {loading && <Loader2 size={14} className={styles.spin} />}
  {confirmLabel}
</button>
```

### Pattern 3: Mutation Hook for Deletion
**What:** Follow the existing `useAppActions` pattern with `useMutation` from React Query for the delete operation.
**When to use:** Both Apps list page and AppDetail page need the delete mutation.
**Example:**
```typescript
const deleteMutation = useMutation({
  mutationFn: (appId: string) => deleteApp(appId),
  onSuccess: () => {
    toast.success(`${appName} deleted successfully`);
    queryClient.invalidateQueries({ queryKey: ["apps"] });
    // Navigate away if on detail page
  },
  onError: (error: Error) => {
    toast.error(error.message || "Failed to delete app");
    // Dialog stays open -- user can retry or cancel
  },
});
```

### Pattern 4: DataTable Actions Column for Delete Icon
**What:** Add an "Actions" column to the Apps list DataTable with a Trash2 icon button per row.
**When to use:** Apps list page to trigger per-row deletion.
**Example:**
```typescript
{
  key: "actions",
  label: "",
  sortable: false,
  render: (app) => (
    <button
      className={styles.deleteButton}
      onClick={() => openDeleteConfirm(app)}
      title="Delete app"
    >
      <Trash2 size={16} />
    </button>
  ),
}
```

### Pattern 5: React Query Cache Invalidation After Delete
**What:** After a successful delete from the Apps list, invalidate the `["apps"]` query key so the row disappears. From AppDetail, also navigate to `/admin/apps`.
**When to use:** `onSuccess` callback of the delete mutation.
**Example:**
```typescript
// From Apps list:
queryClient.invalidateQueries({ queryKey: ["apps"] });
queryClient.invalidateQueries({ queryKey: ["overview"] });

// From AppDetail:
queryClient.invalidateQueries({ queryKey: ["apps"] });
queryClient.invalidateQueries({ queryKey: ["overview"] });
navigate("/apps");
```

### Anti-Patterns to Avoid
- **Optimistic delete:** Do NOT remove the row from the UI before the API confirms success. The user decision says "dialog stays open on error" -- optimistic removal would flash the row away then bring it back.
- **Separate API call for counts:** Do NOT make a separate API call to get snapshot/delivery counts for the confirmation dialog. Enrich the existing app detail response instead.
- **Global delete state:** Do NOT store delete state globally. Each page manages its own confirmation dialog state locally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation dialog | Custom modal | Existing `ConfirmDialog` component | Already handles `<dialog>` showModal, backdrop click, escape key |
| Server state mutation | Manual fetch + setState | `useMutation` from @tanstack/react-query | Handles loading/error/success states, integrates with cache invalidation |
| Toast notifications | Custom notification system | `react-hot-toast` (already imported) | Already used everywhere in the dashboard |
| Navigation | window.location | `useNavigate` from react-router | Already used in Login; SPA-friendly |
| Spinner icon | CSS spinner | `Loader2` from lucide-react with `.spin` CSS class | Already used throughout AppDetail page |

**Key insight:** Every piece of this feature has a precedent in the existing codebase. The `useAppActions` hook shows exactly how to wire `useMutation` + `ConfirmDialog` + `toast`. The only net-new work is the `deleteApi` helper and the `ConfirmDialog` loading enhancement.

## Common Pitfalls

### Pitfall 1: Double-Click on Delete
**What goes wrong:** User clicks "Delete permanently" twice, sending two DELETE requests.
**Why it happens:** No loading/disabled state on the dialog buttons.
**How to avoid:** Add `loading` prop to `ConfirmDialog` that disables both buttons. Pass `deleteMutation.isPending` as the loading value.
**Warning signs:** Two toast notifications appearing, or a 404 error on the second request.

### Pitfall 2: Stale App Detail After List Delete
**What goes wrong:** User deletes app from list, then navigates to that app's detail page from browser history -- sees stale cached data.
**Why it happens:** React Query cache still holds the app detail.
**How to avoid:** Invalidate `["app", appId]` query key in addition to `["apps"]` after deletion. Also, the AppDetail page already handles 404 gracefully with "App not found" UI.
**Warning signs:** Brief flash of old data before 404.

### Pitfall 3: ConfirmDialog Message with Bold Text
**What goes wrong:** The user decision specifies bold app name in the message (`**{appName}**`), but the current `ConfirmDialog.message` prop is `string` rendered as `<p>`.
**Why it happens:** Plain string doesn't support inline formatting.
**How to avoid:** Change the `message` prop type from `string` to `React.ReactNode` so JSX can be passed. This is a backward-compatible change since strings are valid ReactNode.
**Warning signs:** Literal asterisks appearing in the dialog text.

### Pitfall 4: Delete Dialog Counts Require Backend Changes
**What goes wrong:** The confirmation dialog needs snapshot_count and delivery_count, but `AppDetail` type doesn't include them.
**Why it happens:** The current app detail endpoint only returns `repository_count` and `failed_notification_count`.
**How to avoid:** Add `snapshot_count` and `delivery_count` to the `AppDetail` interface in shared-types and enrich the backend response with two additional COUNT queries. For the Apps list page, an extra fetch of the app detail may be needed before showing the confirm dialog (or simplify the list-page dialog message to show only repository count which is already available from `AppSummary`).
**Warning signs:** `undefined` counts displayed in the dialog.

### Pitfall 5: Navigation Timing After Delete
**What goes wrong:** Navigating to `/apps` before React Query invalidation completes -- the list still shows the deleted app briefly.
**Why it happens:** `navigate()` fires before `invalidateQueries` resolves.
**How to avoid:** Call `invalidateQueries` first (it returns a Promise), but since the list page auto-refetches on mount via the query key, this resolves naturally. The brief stale state is acceptable and matches standard React Query behavior.
**Warning signs:** Deleted app appearing momentarily in the list.

## Code Examples

### Backend: Enrich App Detail with Counts
```typescript
// In dashboard-api-apps.ts, inside the GET /admin/api/apps/:appId handler:
const [snapshotCount, deliveryCount] = await Promise.all([
  db.selectFrom("repository_snapshots")
    .innerJoin("app_repositories", "app_repositories.repository_id", "repository_snapshots.repository_id")
    .select((eb) => eb.fn.count("repository_snapshots.id").as("count"))
    .where("app_repositories.app_id", "=", appId)
    .executeTakeFirst(),
  db.selectFrom("app_delivered_files")
    .select((eb) => eb.fn.count("app_id").as("count"))
    .where("app_id", "=", appId)
    .executeTakeFirst(),
]);

// Add to response:
snapshot_count: Number(snapshotCount?.count) || 0,
delivery_count: Number(deliveryCount?.count) || 0,
```

### Frontend: deleteApi Helper
```typescript
// In dashboard/src/api/admin.ts
async function deleteApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`/admin${endpoint}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: "Unknown error",
    }))) as ApiErrorResponse;
    throw new ApiError(errorData.error, response.status);
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data.data;
}
```

### Frontend: Delete Mutation in useAppActions
```typescript
// Add to useAppActions.ts
const [pendingDelete, setPendingDelete] = useState<{ appId: string; appName: string } | null>(null);

const deleteMutation = useMutation({
  mutationFn: (targetAppId: string) => deleteApp(targetAppId),
  onSuccess: () => {
    toast.success(`${pendingDelete?.appName} deleted successfully`);
    queryClient.invalidateQueries({ queryKey: ["apps"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    setPendingDelete(null);
  },
  onError: (error: Error) => {
    toast.error(error.message || "Failed to delete app");
    // Dialog stays open -- pendingDelete not cleared
  },
});
```

### CSS: Red Outlined Delete Button for AppDetail
```css
.deleteAppButton {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background-color: transparent;
  border: 1px solid #ef4444;
  border-radius: 0.375rem;
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.deleteAppButton:hover {
  background-color: #ef4444;
  color: white;
}
```

### CSS: Trash Icon Button for Apps List
```css
.deleteButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: #9ca3af;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.deleteButton:hover {
  color: #ef4444;
  background-color: #fef2f2;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| window.confirm() | `<dialog>` element with showModal() | Already in project | Accessible, styleable, backdrop click support |
| Manual fetch for mutations | useMutation from React Query v5 | Already in project | Automatic loading/error states, cache integration |

**Deprecated/outdated:**
- None relevant -- the project stack is current.

## Open Questions

1. **Apps list confirmation dialog counts**
   - What we know: The Apps list page has `AppSummary` which includes `repository_count` but not `snapshot_count` or `delivery_count`. The user decision says the dialog shows all three counts.
   - What's unclear: Should the Apps list page fetch the full app detail before showing the dialog (extra API call), or should the dialog message be simplified for the list context?
   - Recommendation: Fetch the app detail on-demand when the delete icon is clicked (before opening the dialog). This is a small overhead (~100ms) and provides accurate counts. Alternatively, add the counts to `AppSummary` in the list endpoint, but that adds query complexity to a paginated endpoint.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `dashboard/src/components/ConfirmDialog.tsx` -- current dialog implementation, no loading state
- Codebase analysis: `dashboard/src/hooks/useAppActions.ts` -- mutation + dialog + toast pattern
- Codebase analysis: `dashboard/src/api/admin.ts` -- fetchApi/postApi pattern, no deleteApi exists
- Codebase analysis: `src/routes/admin/delete-app.ts` -- backend endpoint returns `DeleteAppResult`
- Codebase analysis: `src/routes/admin/dashboard-api-apps.ts` -- current app detail response shape
- Codebase analysis: `packages/shared-types/src/dashboard.ts` -- `AppDetail` lacks snapshot/delivery counts
- Codebase analysis: `src/db/types/index.ts` -- database schema with `repository_snapshots` and `app_delivered_files` tables

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in the project, no new deps
- Architecture: HIGH -- all patterns established in existing codebase (useAppActions, ConfirmDialog, admin.ts API layer)
- Pitfalls: HIGH -- identified from direct code analysis of existing components and their limitations

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable -- no external dependencies or fast-moving APIs)
