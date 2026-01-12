Unwatch Repository API
======================

> **STATUS: COMPLETED**

Summary
-------

This milestone introduces the ability for client apps to stop watching a repository they previously registered.

Goals
-----

- Provide `DELETE /api/repositories/{repository_id}` endpoint
- Remove app-repository link and delivery records
- Clean up orphan repositories (no longer watched by any app)
- Delete local clones for orphan repositories

User Story
----------

As an onboarded app, I want to stop watching a repository so I no longer receive notifications about its changes.

Scope
-----

### Included

- DELETE endpoint for unwatching repositories
- Bearer token authentication
- Delivery records cleanup
- Orphan repository detection and cleanup
- Local clone deletion for orphan repositories

### Not Included

- Batch unwatch (multiple repositories at once)
- Pause/resume functionality (unwatch is permanent)

---

API Contract
------------

### Endpoint

```
DELETE /api/repositories/{repository_id}
Authorization: Bearer {token}
```

### Response

| Status | Description |
|--------|-------------|
| 204 | Successfully unwatched |
| 401 | Missing or invalid Bearer token |
| 404 | Repository not found or not registered for this app |

---

Implementation
--------------

### Flow

```
1. Verify app_id + repository_id exists in app_repositories
   └─ NO → 404

2. Delete from app_delivered_files (app_id, repository_id)

3. Delete from app_repositories (app_id, repository_id)

4. Check if other apps monitor this repo
   └─ SELECT COUNT(*) FROM app_repositories WHERE repository_id = X

5. If COUNT = 0 (repo orphan):
   ├─ Delete from snapshot_files (via CASCADE)
   ├─ Delete from repository_snapshots
   ├─ Delete from repositories
   └─ Delete local clone: /data/repos/{owner}/{repo}
```

### Files Created/Modified

| File | Change |
|------|--------|
| `src/schemas/repositories.ts` | Added `RepositoryParamsSchema` |
| `src/repositories/repositories.ts` | Added `unlinkAppFromRepository`, `isRepositoryOrphan`, `deleteRepository` |
| `src/services/git.ts` | Added `deleteLocalRepository` |
| `src/routes/repositories/unwatch.ts` | NEW - Route handler |
| `src/routes/repositories/index.ts` | Registered unwatch route |
| `tests/routes/repositories/unwatch.test.ts` | NEW - Tests |
| `docs/technical_specification.md` | Added endpoint to API table |
| `docs/project_documentation.md` | Added Repository Unwatch section |

---

Acceptance Criteria
-------------------

- [x] DELETE endpoint removes app-repository link
- [x] Delivery records are cleaned up
- [x] Orphan repositories are detected
- [x] Orphan repository data is deleted from database
- [x] Orphan repository local clone is deleted
- [x] Non-orphan repositories remain intact
- [x] Returns 404 for non-existent or unlinked repositories
- [x] Returns 401 for missing/invalid auth
- [x] All tests pass
- [x] Documentation updated

---

Verification
------------

1. **Register repository with App A**
2. **Register same repository with App B**
3. **App A unwatches** → repository remains (App B still watching)
4. **App B unwatches** → repository deleted (orphan)
5. **Verify local clone deleted**: `ls /data/repos/{owner}/{repo}` → not found
