---
phase: 08-failure-notifications
verified: 2026-02-15T10:33:51Z
status: passed
score: 4/4 must-haves verified
---

# Phase 8: Failure Notifications Verification Report

**Phase Goal:** Apps are proactively informed when Docora cannot sync a watched repository, using the same trusted webhook mechanism as file notifications

**Verified:** 2026-02-15T10:33:51Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status     | Evidence                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When a circuit breaker opens for a repository, ALL apps watching that repository receive a sync_failed webhook POST | ✓ VERIFIED | `findAppsWatchingRepository` queries all apps for a repository; `sendSyncFailedNotification` iterates all apps; worker calls it when `circuitOpened === true` |
| 2   | The sync_failed payload includes error type, error message, retry count, and circuit breaker status            | ✓ VERIFIED | `SyncFailedPayload` interface includes `error.type`, `error.message`, `retry_count`, `circuit_breaker.status/consecutive_failures/threshold/cooldown_until` |
| 3   | The sync_failed webhook is signed with the same HMAC mechanism used for file change notifications             | ✓ VERIFIED | `failure-notifier.ts:114` calls `generateSignedHeaders` (same function used in `notifier.ts:76`)                                              |
| 4   | Existing file change notifications (create/update/delete) continue to work without regression                 | ✓ VERIFIED | `notifier.ts` only change: line 36 added `"sync_failed"` to type union; all functions `sendFileNotification`, `buildCreatePayload`, `buildUpdatePayload`, `buildDeletePayload` unchanged |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                  | Expected                                                   | Status     | Details                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/failure-notifier.ts`        | sync_failed notification sending logic                     | ✓ VERIFIED | 131 lines; exports `SyncFailedPayload`, `SyncFailedParams`, `sendSyncFailedNotification`; queries apps, builds payload, sends signed POST |
| `src/services/notifier.ts`                | Updated NotificationEndpoint type including sync_failed    | ✓ VERIFIED | Line 36: `export type NotificationEndpoint = "create" \| "update" \| "delete" \| "sync_failed";`                                        |
| `src/repositories/repositories.ts`        | Query to find all apps watching a repository               | ✓ VERIFIED | Line 547: `findAppsWatchingRepository` exports query joining `app_repositories` and `apps` tables, returns 5 fields including `retry_count` |
| `docs-site/content/_index.md`             | sync_failed webhook documentation                          | ✓ VERIFIED | Complete section with endpoint, When It Fires, payload example, field descriptions, recommended actions; payload matches implementation  |

### Key Link Verification

| From                           | To                                | Via                                               | Status     | Details                                                                                                                   |
| ------------------------------ | --------------------------------- | ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/workers/snapshot.worker.ts` | `src/services/failure-notifier.ts` | import and call when circuitOpened is true        | ✓ WIRED    | Line 23: import; Line 205-214: call inside `if (circuitOpened)` block with `.catch()` (fire-and-forget); `throw gitError` preserved on line 220 |
| `src/services/failure-notifier.ts` | `src/repositories/repositories.ts` | import findAppsWatchingRepository to get all apps | ✓ WIRED    | Line 2: import; Line 54: called with `params.repositoryId`                                                               |
| `src/services/failure-notifier.ts` | `src/utils/signature.ts`           | import generateSignedHeaders for HMAC signing     | ✓ WIRED    | Line 3: import; Line 114-118: called with `app.app_id`, `payload`, `clientAuthKey`; headers passed to axios.post         |
| `docs-site/content/_index.md`  | `src/services/failure-notifier.ts` | documents the SyncFailedPayload shape             | ✓ VERIFIED | Payload example matches `SyncFailedPayload` interface exactly (event, repository, error, circuit_breaker, retry_count, timestamp) |

### Requirements Coverage

Not explicitly mapped in REQUIREMENTS.md, but phase references NOTIFY-01, NOTIFY-02, NOTIFY-03 in ROADMAP.md:

| Requirement | Status      | Evidence                                                                                                       |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| NOTIFY-01   | ✓ SATISFIED | Apps receive sync_failed webhook when circuit breaker opens (worker calls `sendSyncFailedNotification`)       |
| NOTIFY-02   | ✓ SATISFIED | Payload includes error type, message, retry count, circuit breaker status (verified in SyncFailedPayload type) |
| NOTIFY-03   | ✓ SATISFIED | HMAC-signed webhook (same `generateSignedHeaders` function used)                                              |

### Anti-Patterns Found

None detected.

**Files scanned:**
- `src/services/failure-notifier.ts`: No TODOs, no placeholder comments, no stub returns
- `src/services/notifier.ts`: Only change is type union addition (safe)
- `src/repositories/repositories.ts`: Complete query with all required fields
- `src/workers/snapshot.worker.ts`: Fire-and-forget pattern correctly implemented with `.catch()`, `throw gitError` preserved
- `docs-site/content/_index.md`: Complete documentation

### Human Verification Required

#### 1. End-to-end sync_failed notification flow

**Test:**
1. Register a test app with Docora
2. Register a repository with an invalid GitHub token
3. Wait for 5 consecutive sync failures (circuit breaker opens)
4. Check that the app receives a sync_failed POST at `{base_url}/sync_failed`

**Expected:**
- Webhook arrives with correct payload structure
- `error.message` describes the authentication failure
- `circuit_breaker.status` is "open"
- `circuit_breaker.consecutive_failures` is 5
- Webhook has valid HMAC signature headers

**Why human:** Requires running the system, triggering circuit breaker, and observing webhook delivery.

#### 2. Multiple apps receive notification

**Test:**
1. Register two apps (App A, App B) with Docora
2. Register the same repository to both apps
3. Trigger circuit breaker open (5 consecutive failures)
4. Verify both apps receive sync_failed notification

**Expected:**
- Both App A and App B receive the webhook
- Each app's `retry_count` field reflects their individual retry count

**Why human:** Requires multi-app setup and webhook verification on multiple endpoints.

#### 3. File notifications still work after phase 08

**Test:**
1. Register an app and a repository with valid credentials
2. Push a new file to the repository
3. Verify app receives a `create` notification

**Expected:**
- `create` notification arrives at `{base_url}/create`
- Payload has `repository`, `file`, `commit_sha`, `timestamp`
- HMAC signature is valid

**Why human:** Regression test requiring real repository changes and webhook verification.

#### 4. Fire-and-forget notification doesn't block worker

**Test:**
1. Register an app with an unreachable `base_url` (e.g., `http://localhost:99999/`)
2. Trigger circuit breaker open
3. Check worker logs

**Expected:**
- Worker logs show "Failed to send sync_failed notifications" error
- Worker still throws `gitError` and retries the snapshot job via BullMQ
- Worker does not hang or wait for notification to succeed

**Why human:** Requires observing worker behavior under failure conditions and log inspection.

---

## Summary

All must-haves verified. Phase goal achieved.

**Implementation Status:**
- ✓ `failure-notifier.ts` service created with complete sync_failed notification logic
- ✓ `findAppsWatchingRepository` data access query returns all watching apps with retry_count
- ✓ `NotificationEndpoint` type extended to include "sync_failed"
- ✓ Worker calls notification service when `circuitOpened === true` (fire-and-forget pattern)
- ✓ HMAC signing uses the same `generateSignedHeaders` function as file notifications
- ✓ Documentation added with complete payload example, field descriptions, and recommended actions
- ✓ Existing file notification flow completely unchanged (no regression)

**Commits Verified:**
- `5c5f43f` - feat(08-01): create failure-notifier service and data access query
- `71078a8` - feat(08-01): wire failure-notifier into snapshot worker on circuit breaker open
- `6d99a29` - docs(08-02): add sync_failed webhook documentation

**Human Verification:**
4 items require manual testing (end-to-end flow, multi-app broadcast, file notification regression, fire-and-forget behavior).

---

_Verified: 2026-02-15T10:33:51Z_
_Verifier: Claude (gsd-verifier)_
