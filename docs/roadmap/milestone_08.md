Per-App Delivery Tracking
==========================

> **STATUS: COMPLETED**

Summary
-------

This milestone introduces per-app delivery tracking to ensure each registered app receives a consistent view of repository state, even when multiple apps monitor the same repository and some experience delivery failures.

Problem Statement
-----------------

Currently, snapshots are stored per-repository. When multiple apps monitor the same repo:

1. App A succeeds → snapshot saved
2. App B fails mid-delivery
3. Repository updates
4. App B retries → uses wrong baseline, may miss files or receive incorrect operations

Goals
-----

- Track delivered files per app-repository pair
- Calculate changes from each app's perspective
- Ensure all apps converge to the correct final state
- Maintain backward compatibility

User Story
----------

As a client app, I want to receive notifications based on what I have already received, so that I never miss files even if other apps monitoring the same repository succeed or fail independently.

Design Philosophy
-----------------

**"Current state wins"**: Apps receive the latest content, not historical versions.

The operation type (CREATE/UPDATE/DELETE) is determined by what the app knows:

| App knows | Repo has | Operation |
|-----------|----------|-----------|
| (nothing) | file.txt: sha_v2 | CREATE |
| file.txt: sha_v1 | file.txt: sha_v2 | UPDATE |
| file.txt: sha_v1 | (deleted) | DELETE |
| file.txt: sha_v1 | file.txt: sha_v1 | (none) |

---

Database Schema
---------------

### New Table: `app_delivered_files`

```sql
CREATE TABLE app_delivered_files (
    app_id          VARCHAR(36) NOT NULL,
    repository_id   VARCHAR(36) NOT NULL,
    file_path       VARCHAR(1024) NOT NULL,
    file_sha        VARCHAR(64) NOT NULL,
    delivered_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (app_id, repository_id, file_path),

    FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id) REFERENCES repositories(repository_id) ON DELETE CASCADE
);

CREATE INDEX idx_app_delivered_files_lookup
    ON app_delivered_files(app_id, repository_id);
```

### Liquibase Migration (YAML)

```yaml
databaseChangeLog:
  - changeSet:
      id: 008-app-delivered-files
      author: docora
      changes:
        - createTable:
            tableName: app_delivered_files
            columns:
              - column:
                  name: app_id
                  type: varchar(36)
                  constraints:
                    nullable: false
              - column:
                  name: repository_id
                  type: varchar(36)
                  constraints:
                    nullable: false
              - column:
                  name: file_path
                  type: varchar(1024)
                  constraints:
                    nullable: false
              - column:
                  name: file_sha
                  type: varchar(64)
                  constraints:
                    nullable: false
              - column:
                  name: delivered_at
                  type: timestamp
                  defaultValueComputed: CURRENT_TIMESTAMP
                  constraints:
                    nullable: false
        - addPrimaryKey:
            tableName: app_delivered_files
            columnNames: app_id, repository_id, file_path
            constraintName: pk_app_delivered_files
        - addForeignKeyConstraint:
            baseTableName: app_delivered_files
            baseColumnNames: app_id
            referencedTableName: apps
            referencedColumnNames: app_id
            constraintName: fk_app_delivered_files_app
            onDelete: CASCADE
        - addForeignKeyConstraint:
            baseTableName: app_delivered_files
            baseColumnNames: repository_id
            referencedTableName: repositories
            referencedColumnNames: repository_id
            constraintName: fk_app_delivered_files_repo
            onDelete: CASCADE
        - createIndex:
            tableName: app_delivered_files
            indexName: idx_app_delivered_files_lookup
            columns:
              - column:
                  name: app_id
              - column:
                  name: repository_id
```

---

API Changes
-----------

No external API changes. This is an internal improvement.

---

Implementation Phases
---------------------

### Phase 1: Database Migration

Create Liquibase migration file for `app_delivered_files` table.

**File:** `db/changelog/008-app-delivered-files.yaml`

---

### Phase 2: Repository Layer

Create new repository module for delivery tracking.

**File to create:** `src/repositories/deliveries.ts`

```typescript
export interface DeliveredFile {
  file_path: string;
  file_sha: string;
  delivered_at: Date;
}

// Get all delivered files for an app-repository pair
export async function getDeliveredFiles(
  appId: string,
  repositoryId: string
): Promise<Map<string, string>>; // path → sha

// Record successful delivery of a file
export async function recordDelivery(
  appId: string,
  repositoryId: string,
  filePath: string,
  fileSha: string
): Promise<void>;

// Record successful delivery of multiple files (batch)
export async function recordDeliveries(
  appId: string,
  repositoryId: string,
  files: Array<{ path: string; sha: string }>
): Promise<void>;

// Remove delivery record (for DELETE operations)
export async function removeDelivery(
  appId: string,
  repositoryId: string,
  filePath: string
): Promise<void>;

// Clear all deliveries for an app-repository (for reset/re-sync)
export async function clearDeliveries(
  appId: string,
  repositoryId: string
): Promise<void>;
```

---

### Phase 3: Change Detection Update

Modify change detection to compare against app's delivered state instead of repository snapshot.

**File to modify:** `src/services/change-detector.ts`

Current signature:
```typescript
export function detectAndSortChanges(
  currentFiles: ScannedFile[],
  previousFileHashes: Map<string, string>  // from snapshot
): FileChange[];
```

No signature change needed - just pass different `previousFileHashes`:
- Before: `getSnapshotFileHashes(repository_id)`
- After: `getDeliveredFiles(app_id, repository_id)`

---

### Phase 4: Snapshot Worker Update

Modify worker to:
1. Use per-app delivered files for change detection
2. Record delivery after each successful notification
3. Keep snapshot saving (for repository state tracking)

**File to modify:** `src/workers/snapshot.worker.ts`

```typescript
// Before:
const previousFileHashes = await getSnapshotFileHashes(repository_id);
const changes = detectAndSortChanges(processedFiles, previousFileHashes);

for (const change of changes) {
  const result = await sendChangeNotification(...);
  if (!result.success) throw new Error(...);
}

await saveSnapshot(repository_id, ...);

// After:
const deliveredFiles = await getDeliveredFiles(app_id, repository_id);
const changes = detectAndSortChanges(processedFiles, deliveredFiles);

for (const change of changes) {
  const result = await sendChangeNotification(...);
  if (!result.success) throw new Error(...);

  // Record delivery immediately after success
  if (change.type === 'deleted') {
    await removeDelivery(app_id, repository_id, change.path);
  } else {
    await recordDelivery(app_id, repository_id, change.path, change.currentFile!.sha);
  }
}

// Still save snapshot (tracks repo state, used for other purposes)
await saveSnapshot(repository_id, ...);
```

---

### Phase 5: Testing

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/repositories/deliveries.test.ts` | Delivery tracking CRUD tests |
| `tests/workers/snapshot.multi-app.test.ts` | Multi-app scenario tests |

**Test scenarios:**

1. **Single app, happy path**: All files delivered, all tracked
2. **Single app, partial failure**: Some files tracked, retry sends missing
3. **Multi-app, one fails**: App A complete, App B partial, both converge
4. **File update during retry**: App receives latest version
5. **File delete during retry**: App receives DELETE for file it never got CREATE for (edge case)

---

### Phase 6: Migration Strategy

For existing data, we need to populate `app_delivered_files` from current snapshots.

**Option A: Lazy migration**
- On first scan after upgrade, `getDeliveredFiles` returns empty
- All files sent as CREATE
- Works, but re-sends everything

**Option B: Data migration script**
- One-time script to populate from existing snapshots
- Assumes all apps have received all files in current snapshot
- Cleaner, no re-delivery

Recommend **Option B** with migration script.

**Migration script logic:**
```sql
INSERT INTO app_delivered_files (app_id, repository_id, file_path, file_sha, delivered_at)
SELECT
    ar.app_id,
    ar.repository_id,
    sf.path,
    sf.sha,
    NOW()
FROM app_repositories ar
JOIN repository_snapshots rs ON ar.repository_id = rs.repository_id
JOIN snapshot_files sf ON rs.id = sf.snapshot_id
WHERE ar.status = 'synced';
```

---

File Structure
--------------

```
src/
├── repositories/
│   └── deliveries.ts           (NEW)
├── services/
│   └── change-detector.ts      (MODIFY - no signature change)
└── workers/
    └── snapshot.worker.ts      (MODIFY)

db/changelog/
└── 008-app-delivered-files.yaml (NEW)

tests/
├── repositories/
│   └── deliveries.test.ts      (NEW)
└── workers/
    └── snapshot.multi-app.test.ts (NEW)
```

---

Acceptance Criteria
-------------------

- [x] `app_delivered_files` table created via Liquibase migration
- [x] Delivery tracking repository module implemented
- [x] Change detection uses per-app delivered files
- [x] Worker records delivery after each successful notification
- [x] Worker removes delivery record after successful DELETE
- [x] Multi-app scenario: independent apps converge to same state
- [x] Partial failure scenario: retry sends only missing files
- [x] File change during retry: app receives latest version
- [ ] Migration script for existing data (optional, lazy migration works)
- [x] All tests pass

---

Edge Cases
----------

### File deleted before app received it

```
T1: file.txt exists
    App B: file.txt CREATE → FAIL

T2: file.txt deleted
    App B retry:
    - delivered = {} (no file.txt)
    - current = {} (no file.txt)
    - diff = nothing!
```

App B never knew about file.txt, and it doesn't exist now. No action needed. Correct behavior.

### File created, modified, deleted before app syncs

```
T1: file.txt created (sha1)
    App B: FAIL

T2: file.txt modified (sha2)
    App B: still failing

T3: file.txt deleted
    App B finally syncs:
    - delivered = {}
    - current = {}
    - Nothing to do!
```

Correct. The file's entire lifecycle happened while App B was down. No action needed.

### Same file path, different content over time

```
T1: config.json (sha1)
    App B: CREATE → FAIL

T2: config.json (sha2) - content changed
    App B retry:
    - delivered = {}
    - current = {config.json: sha2}
    - Operation: CREATE with sha2
```

App B gets the latest version. It never knew about sha1, doesn't matter.

---

Verification
------------

1. **Setup multi-app test:**
   ```bash
   # Register same repo with two apps
   # Configure one app to fail intermittently
   ```

2. **Verify independent tracking:**
   ```sql
   SELECT * FROM app_delivered_files
   WHERE repository_id = 'repo_x'
   ORDER BY app_id, file_path;
   ```

3. **Verify convergence:**
   - Both apps should eventually have same files in `app_delivered_files`
   - SHAs should match current repository state

---

Future Considerations
---------------------

- **Delivery history**: Could add `delivery_history` table for audit trail
- **Batch optimization**: Record multiple deliveries in single transaction
- **Cleanup**: Periodic cleanup of orphaned delivery records
