# Phase 13: App Deletion UI - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Dashboard interface for triggering and confirming app deletion. Admins can delete apps from both the Apps list page and the App Detail page, with a confirmation dialog showing the scope of what will be removed. After deletion, the app disappears and the admin is returned to the apps list.

</domain>

<decisions>
## Implementation Decisions

### Delete button placement
- **Apps list page:** Trash icon button (lucide-react Trash2) per row, icon-only with tooltip "Delete app" on hover
- **App Detail page:** Red outlined button ("Delete App") in the header area next to the app name — red border + red text, subtle until hovered

### Confirmation dialog content
- Use existing `ConfirmDialog` component with `variant="danger"`
- Dialog title: "Delete App"
- Dialog message shows app name and actual counts: "This will permanently delete **{appName}** along with {N} repositories, {N} snapshots, and {N} deliveries."
- Counts sourced from enriched app detail data (add snapshot_count and delivery_count to existing app detail response)
- No type-to-confirm — standard click confirmation
- Confirm button text: "Delete permanently"

### Post-deletion behavior
- **From App Detail page:** Navigate to `/admin/apps` + success toast ("AppName deleted successfully")
- **From Apps list page:** Row removed in-place via React Query invalidation + success toast (stay on same page)
- **On error:** Red error toast with API error message, dialog stays open so user can retry or cancel
- **Loading state:** Spinner on "Delete permanently" button while API call in flight, both buttons disabled to prevent double-clicks

### Claude's Discretion
- Exact icon size and spacing in the list row
- CSS Module styling details for the outlined red button
- Toast message wording refinements
- How to structure the deletion mutation hook (likely extend useAppActions or create a new hook)

</decisions>

<specifics>
## Specific Ideas

- Trash icon should be consistent with existing action button patterns in the dashboard (same size/spacing as retry/resync buttons)
- Red outlined button style: red border + red text at rest, solid red on hover — less aggressive than the existing solid red buttons used for re-sync
- Counts in the confirmation dialog give the admin full visibility before committing — no surprises

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-app-deletion-ui*
*Context gathered: 2026-02-25*
