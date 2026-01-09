Change Detection & Granular Notifications
==========================================

> **STATUS: IN PROGRESS**

# Summary

This milestone introduces change detection and granular file notifications. Docora compares the current repository state with the previous snapshot to detect file changes (created, updated, deleted) and notifies client apps through dedicated endpoints.

# Goals

- Implement change detection by comparing snapshots
- Call specific endpoints for each change type (create, update, delete)
- Add HMAC signature for webhook security
- Use initial snapshot flow with `create` endpoint for new repositories

# User Story

As an onboarded app, I want to receive granular notifications about file changes so I can react to specific events instead of processing full snapshots.

# Scope

## Included

- Change detection (compare current scan with stored snapshot)
- Separate endpoints: `{base_url}/create`, `{base_url}/update`, `{base_url}/delete`
- One HTTP call per file changed
- HMAC signature on all webhook requests
- Initial snapshot calls `create` for each file
- Ordering: delete → create → update

## Not Included

- Rename detection (tracked in backlog)
- Batch endpoints (one call per file)
- Plugin transformations (future milestone)

---

# API Contract

## Authentication Headers

All webhook requests include HMAC-based authentication (no Bearer token to avoid exposing the secret):

```
X-Docora-App-Id: {app_id}
X-Docora-Signature: sha256={hmac_signature}
X-Docora-Timestamp: {unix_timestamp}
```

**Why no Bearer token?**
- Bearer tokens expose the secret in every request
- If a webhook is intercepted, attacker gets the secret
- With HMAC-only, the secret (`client_auth_key`) is NEVER transmitted after onboarding

### HMAC Signature Computation

```
payload = timestamp + "." + JSON.stringify(body)
signature = HMAC-SHA256(payload, client_auth_key)
```

The `client_auth_key` is used ONLY to compute the signature, never transmitted.

### Signature Verification (Client Side)

```javascript
const crypto = require('crypto');

function verifyWebhook(appId, body, timestamp, signature, secret) {
  // 1. Verify app_id matches expected
  if (appId !== expectedAppId) {
    return false;
  }

  // 2. Verify timestamp is recent (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) { // 5 minutes
    return false;
  }

  // 3. Verify signature
  const payload = timestamp + '.' + JSON.stringify(body);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from('sha256=' + expected)
  );
}
```

---

## Endpoints

### POST {base_url}/create

Called when a new file is detected.

```json
{
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "src/index.ts",
    "sha": "abc123def456...",
    "size": 1234,
    "content": "import express from 'express';\n..."
  },
  "commit_sha": "a1b2c3d4e5f6...",
  "timestamp": "2025-01-09T12:00:00Z"
}
```

### POST {base_url}/update

Called when an existing file is modified.

```json
{
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "src/index.ts",
    "sha": "new789xyz...",
    "size": 1456,
    "content": "import express from 'express';\n// updated..."
  },
  "previous_sha": "abc123def456...",
  "commit_sha": "a1b2c3d4e5f6...",
  "timestamp": "2025-01-09T12:00:00Z"
}
```

### POST {base_url}/delete

Called when a file is removed.

```json
{
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "src/old-file.ts",
    "sha": "deleted123..."
  },
  "commit_sha": "a1b2c3d4e5f6...",
  "timestamp": "2025-01-09T12:00:00Z"
}
```

---

## Expected Responses

| Status | Meaning |
|--------|---------|
| 2xx | Success |
| 4xx | Client error, do not retry |
| 5xx | Server error, retry with backoff |

---

# Change Detection Algorithm

```
1. Scan current repository state → currentFiles (Map<path, sha>)
2. Load previous snapshot → previousFiles (Map<path, sha>)
3. Compare:
   - DELETED: paths in previousFiles but not in currentFiles
   - CREATED: paths in currentFiles but not in previousFiles
   - UPDATED: paths in both but sha differs
4. Process in order: DELETE → CREATE → UPDATE
```

---

# Implementation Phases

## Phase 1: HMAC Signature Utility

**File to create:** `src/utils/signature.ts`

```typescript
import crypto from 'crypto';

export interface SignedHeaders {
  'X-Docora-App-Id': string;
  'X-Docora-Signature': string;
  'X-Docora-Timestamp': string;
}

export function generateSignedHeaders(
  appId: string,
  body: object,
  secret: string,
  timestamp?: number
): SignedHeaders {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const payload = ts + '.' + JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return {
    'X-Docora-App-Id': appId,
    'X-Docora-Signature': 'sha256=' + signature,
    'X-Docora-Timestamp': String(ts),
  };
}
```

---

## Phase 2: Update Notifier Service

**File to modify:** `src/services/notifier.ts`

Changes:
- Add `sendFileNotification(baseUrl, endpoint, payload, appId, clientAuthKey)` function
- Remove Bearer token, use HMAC-only authentication
- Add headers: `X-Docora-App-Id`, `X-Docora-Signature`, `X-Docora-Timestamp`
- Support `/create`, `/update`, `/delete` endpoints
- Keep `sendSnapshot` for backwards compatibility (deprecated)

New interfaces:

```typescript
export interface FilePayload {
  repository: RepositoryInfo;
  file: {
    path: string;
    sha: string;
    size?: number;
    content?: string;
  };
  previous_sha?: string;  // Only for updates
  commit_sha: string;
  timestamp: string;
}

export type NotificationEndpoint = 'create' | 'update' | 'delete';
```

---

## Phase 3: Change Detection Service

**File to create:** `src/services/change-detector.ts`

```typescript
import type { ScannedFile } from './scanner.js';

export interface FileChange {
  type: 'created' | 'updated' | 'deleted';
  path: string;
  currentFile?: ScannedFile;  // Present for created/updated
  previousSha?: string;        // Present for updated/deleted
}

export function detectChanges(
  currentFiles: ScannedFile[],
  previousFiles: Map<string, string>  // path → sha
): FileChange[] {
  const changes: FileChange[] = [];
  const currentMap = new Map(currentFiles.map(f => [f.path, f]));

  // Detect deleted files
  for (const [path, sha] of previousFiles) {
    if (!currentMap.has(path)) {
      changes.push({ type: 'deleted', path, previousSha: sha });
    }
  }

  // Detect created and updated files
  for (const file of currentFiles) {
    const previousSha = previousFiles.get(file.path);
    if (!previousSha) {
      changes.push({ type: 'created', path: file.path, currentFile: file });
    } else if (previousSha !== file.sha) {
      changes.push({
        type: 'updated',
        path: file.path,
        currentFile: file,
        previousSha
      });
    }
  }

  return changes;
}

// Sort changes: delete → create → update
export function sortChanges(changes: FileChange[]): FileChange[] {
  const order = { deleted: 0, created: 1, updated: 2 };
  return [...changes].sort((a, b) => order[a.type] - order[b.type]);
}
```

---

## Phase 4: Update Snapshot Repository

**File to modify:** `src/repositories/snapshots.ts`

Add function to get previous file hashes:

```typescript
export async function getSnapshotFileHashes(
  repositoryId: string
): Promise<Map<string, string>> {
  // Returns Map<path, sha> for the last snapshot
}
```

---

## Phase 5: Update Snapshot Worker

**File to modify:** `src/workers/snapshot.worker.ts`

Replace bulk snapshot logic with:

1. Get previous snapshot hashes
2. Scan current files
3. Detect changes
4. For each change (in order):
   - Build payload
   - Send to appropriate endpoint (`/create`, `/update`, `/delete`)
   - Handle failures individually
5. Update snapshot in database

Handle initial snapshot (no previous):
- Treat all files as "created"
- Call `/create` for each file

---

## Phase 6: Testing

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/utils/signature.test.ts` | HMAC signature generation/verification |
| `tests/services/change-detector.test.ts` | Change detection logic |
| `tests/services/notifier.test.ts` | Update existing tests for new endpoints |
| `tests/workers/snapshot.worker.test.ts` | Integration tests for new flow |

---

# File Structure

```
src/
├── services/
│   ├── change-detector.ts      (NEW)
│   ├── notifier.ts             (MODIFY)
│   ├── git.ts                  (existing)
│   └── scanner.ts              (existing)
├── utils/
│   ├── signature.ts            (NEW)
│   └── ...existing
├── repositories/
│   └── snapshots.ts            (MODIFY)
└── workers/
    └── snapshot.worker.ts      (MODIFY)

tests/
├── utils/
│   └── signature.test.ts       (NEW)
├── services/
│   └── change-detector.test.ts (NEW)
└── workers/
    └── snapshot.worker.test.ts (MODIFY)
```

---

# Acceptance Criteria

- [ ] HMAC signature added to all webhook requests
- [ ] Change detection compares current scan with previous snapshot
- [ ] `/create` endpoint called for new files
- [ ] `/update` endpoint called for modified files
- [ ] `/delete` endpoint called for removed files
- [ ] Initial snapshot uses `/create` for all files
- [ ] Changes processed in order: delete → create → update
- [ ] Failed notifications retry with exponential backoff
- [ ] Documentation updated with authentication flow
- [ ] All tests pass

---

# Verification

1. **Setup:**
   ```bash
   # Start mock client app that logs received webhooks
   # Start Docora API + Worker
   ```

2. **Test initial snapshot:**
   - Onboard app → get token
   - Register repository
   - Verify `/create` called for each file

3. **Test change detection:**
   - Modify a file in the repo
   - Wait for next scan
   - Verify `/update` called with correct payload

4. **Test file deletion:**
   - Delete a file in the repo
   - Wait for next scan
   - Verify `/delete` called

5. **Verify HMAC:**
   - Check `X-Docora-Signature` and `X-Docora-Timestamp` headers
   - Verify signature computation matches
