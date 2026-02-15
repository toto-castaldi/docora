---
title: "Webhook API"
---

# Webhook API Documentation

<div class="intro">
<p>Docora monitors GitHub repositories and sends real-time notifications to your application when files change. This documentation covers the webhook endpoints your application must implement to receive these notifications.</p>
</div>

## Overview

When you register a repository with Docora, your application will receive HTTP POST requests whenever files are created, updated, or deleted. If Docora detects persistent sync failures for a repository, it sends a sync_failed alert. Your application must expose four endpoints to handle these events.

### How It Works

1. You register your application with Docora (onboarding)
2. You register one or more GitHub repositories to monitor
3. Docora scans the repository and sends initial file notifications
4. On subsequent changes, Docora sends create/update/delete notifications
5. If syncing fails repeatedly, Docora sends a sync_failed alert so you can take action

---

## Authentication

All webhook requests from Docora are authenticated using **HMAC-SHA256 signatures**. This ensures that:

- Requests genuinely come from Docora
- Payload hasn't been tampered with
- Replay attacks are prevented

### Headers

Every webhook request includes these authentication headers:

| Header | Description |
|--------|-------------|
| `X-Docora-App-Id` | Your application's unique identifier |
| `X-Docora-Signature` | HMAC-SHA256 signature (`sha256=...`) |
| `X-Docora-Timestamp` | Unix timestamp when request was signed |

### Signature Verification

To verify the signature, your application should:

1. Extract the timestamp from `X-Docora-Timestamp`
2. Verify the timestamp is within 5 minutes of current time
3. Reconstruct the signed payload
4. Compute HMAC-SHA256 using your `client_auth_key`
5. Compare signatures using constant-time comparison

#### Signed Payload Format

```
{timestamp}.{JSON body}
```

#### Verification Example (Node.js)

```javascript
const crypto = require('crypto');

function verifySignature(req, clientAuthKey) {
  const signature = req.headers['x-docora-signature'];
  const timestamp = req.headers['x-docora-timestamp'];

  // Check timestamp (5 minute window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  // Reconstruct signed payload
  const payload = `${timestamp}.${JSON.stringify(req.body)}`;

  // Compute expected signature
  const expected = 'sha256=' + crypto
    .createHmac('sha256', clientAuthKey)
    .update(payload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

<div class="alert alert-important">
<strong>Security Note:</strong> The <code>client_auth_key</code> is only transmitted once during onboarding. Store it securely and never expose it in logs or responses.
</div>

---

## Endpoints

Your application must expose these endpoints at your registered `base_url`:

| Endpoint | Description |
|----------|-------------|
| `POST {base_url}/create` | New file detected |
| `POST {base_url}/update` | Existing file modified |
| `POST {base_url}/delete` | File removed |
| `POST {base_url}/sync_failed` | Repository sync failure alert |

### POST /create

Called when a new file is detected in the repository.

<div class="endpoint">
<span class="badge badge-post">POST</span> <code>{base_url}/create</code>
</div>

#### Request Body

```json
{
  "repository": {
    "repository_id": "repo_abc123def456",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "src/index.ts",
    "sha": "a1b2c3d4e5f6...",
    "size": 1234,
    "content": "import express from 'express';\n..."
  },
  "commit_sha": "abc123def456789...",
  "timestamp": "2025-01-11T12:00:00.000Z"
}
```

### POST /update

Called when an existing file is modified.

<div class="endpoint">
<span class="badge badge-post">POST</span> <code>{base_url}/update</code>
</div>

#### Request Body

```json
{
  "repository": {
    "repository_id": "repo_abc123def456",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "src/index.ts",
    "sha": "new_sha_abc123...",
    "size": 2048,
    "content": "import express from 'express';\n// Updated content..."
  },
  "previous_sha": "old_sha_xyz789...",
  "commit_sha": "abc123def456789...",
  "timestamp": "2025-01-11T12:00:00.000Z"
}
```

### POST /delete

Called when a file is removed from the repository.

<div class="endpoint">
<span class="badge badge-post">POST</span> <code>{base_url}/delete</code>
</div>

#### Request Body

```json
{
  "repository": {
    "repository_id": "repo_abc123def456",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "src/deleted-file.ts",
    "sha": "last_known_sha..."
  },
  "commit_sha": "abc123def456789...",
  "timestamp": "2025-01-11T12:00:00.000Z"
}
```

### POST /sync_failed

Called when Docora's circuit breaker opens for a watched repository after consecutive git sync failures. This is a proactive alert — your app does not need to poll for failures.

<div class="endpoint">
<span class="badge badge-post">POST</span> <code>{base_url}/sync_failed</code>
</div>

#### When It Fires

- After consecutive git failures reach the configured threshold (default: 5), the circuit breaker opens
- **All** apps watching the affected repository receive the notification
- The circuit breaker has a cooldown period (default: 30 minutes) before Docora retries syncing

#### Request Body

```json
{
  "event": "sync_failed",
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "error": {
    "type": "git_failure",
    "message": "Authentication failed for 'https://github.com/owner/repo.git'"
  },
  "circuit_breaker": {
    "status": "open",
    "consecutive_failures": 5,
    "threshold": 5,
    "cooldown_until": "2024-01-15T12:30:00.000Z"
  },
  "retry_count": 3,
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### Payload Fields

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Always `"sync_failed"` |
| `repository` | object | The repository that failed to sync (same shape as file notification payloads) |
| `error.type` | string | Error classification (currently always `"git_failure"`) |
| `error.message` | string | Detailed error message from the git operation |
| `circuit_breaker.status` | string | Always `"open"` (notification only fires when circuit opens) |
| `circuit_breaker.consecutive_failures` | number | Number of consecutive failures that triggered the circuit |
| `circuit_breaker.threshold` | number | Configured failure threshold (default 5) |
| `circuit_breaker.cooldown_until` | string | ISO 8601 timestamp when Docora will retry syncing |
| `retry_count` | number | Number of retries attempted for this app-repository pair |
| `timestamp` | string | ISO 8601 timestamp when the notification was generated |

#### Recommended Actions

When your application receives a `sync_failed` notification:

1. **Check if the GitHub token needs rotation** — this is the most common cause (expired or revoked token)
2. **Verify the repository still exists** and is accessible on GitHub
3. **Update the token** using the `PATCH /api/repositories/:repository_id/token` endpoint
4. **Wait for automatic retry** — after the cooldown period, Docora will automatically retry syncing

<div class="alert alert-info">
<strong>Authentication:</strong> This endpoint uses the same HMAC-SHA256 signature verification as all other Docora webhooks. See the <a href="#authentication">Authentication</a> section above.
</div>

---

## Payload Structure

### Repository Object

| Field | Type | Description |
|-------|------|-------------|
| `repository_id` | string | Docora's internal repository identifier |
| `github_url` | string | Full GitHub URL |
| `owner` | string | Repository owner/organization |
| `name` | string | Repository name |

### File Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | File path relative to repository root |
| `sha` | string | Yes | SHA-256 hash of file content |
| `size` | number | create/update | File size in bytes |
| `content` | string | create/update | File content (text or Base64) |
| `content_encoding` | string | No | `"base64"` for binary files |
| `chunk` | object | No | Present for chunked files |

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repository` | object | Yes | Repository metadata |
| `file` | object | Yes | File metadata and content |
| `commit_sha` | string | Yes | Git commit SHA |
| `timestamp` | string | Yes | ISO 8601 timestamp |
| `previous_sha` | string | update only | Previous file SHA |

---

## Binary Files

Binary files (images, PDFs, videos, etc.) are automatically detected and handled specially.

### Encoding

Binary file content is encoded as **Base64** and includes the `content_encoding` field:

```json
{
  "file": {
    "path": "assets/logo.png",
    "sha": "abc123...",
    "size": 50000,
    "content": "iVBORw0KGgoAAAANSUhEUgAA...",
    "content_encoding": "base64"
  }
}
```

### Chunking

Large binary files are split into chunks to handle memory and payload size limits.

<div class="alert alert-info">
<strong>Chunk Threshold:</strong> Files larger than 1MB are automatically chunked into 512KB pieces.
</div>

#### Chunked Payload

Each chunk is sent as a separate HTTP request:

```json
{
  "repository": { ... },
  "file": {
    "path": "assets/video.mp4",
    "sha": "abc123...",
    "size": 5242880,
    "content": "<base64 encoded chunk>",
    "content_encoding": "base64",
    "chunk": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "index": 0,
      "total": 10
    }
  },
  "commit_sha": "...",
  "timestamp": "..."
}
```

#### Chunk Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier for this file transfer |
| `index` | number | Zero-based chunk index |
| `total` | number | Total number of chunks |

### Client Reassembly

To reassemble chunked files:

1. Detect chunked payload by presence of `chunk` object
2. Buffer chunks by `chunk.id`
3. When all chunks received (`index` 0 to `total-1`), concatenate `content` strings
4. Decode concatenated Base64 to binary
5. Implement timeout for incomplete transfers (recommended: 5 minutes)

#### Reassembly Example (Node.js)

```javascript
const transfers = new Map();

function handleWebhook(payload) {
  if (!payload.file.chunk) {
    // Non-chunked file
    return processFile(payload.file);
  }

  const { id, index, total } = payload.file.chunk;

  if (!transfers.has(id)) {
    transfers.set(id, {
      chunks: new Array(total),
      received: 0,
      total,
      timeout: setTimeout(() => transfers.delete(id), 5 * 60 * 1000)
    });
  }

  const transfer = transfers.get(id);
  transfer.chunks[index] = payload.file.content;
  transfer.received++;

  if (transfer.received === transfer.total) {
    clearTimeout(transfer.timeout);
    const fullBase64 = transfer.chunks.join('');
    const binary = Buffer.from(fullBase64, 'base64');
    transfers.delete(id);
    return processFile({ ...payload.file, content: binary });
  }
}
```

---

## Error Handling

### Expected Response

Your endpoints should return:

| Status | Meaning |
|--------|---------|
| `2xx` | Success - file processed |
| `4xx` / `5xx` | Failure - Docora will retry |

### Retry Behavior

- Any non-2xx response triggers a job retry
- Retries use exponential backoff
- Maximum 5 retry attempts (configurable)
- After max retries, repository is marked as `failed`

<div class="alert alert-warning">
<strong>Idempotency:</strong> Your endpoints must be idempotent. On retry, you may receive the same file notification multiple times.
</div>

### Handling Duplicate Notifications

Use the `file.sha` as an idempotency key:

```javascript
app.post('/create', async (req, res) => {
  const { file, repository } = req.body;

  // Check if already processed
  const exists = await db.files.findOne({
    repositoryId: repository.repository_id,
    path: file.path,
    sha: file.sha
  });

  if (exists) {
    // Already processed, return success
    return res.status(200).json({ status: 'already_processed' });
  }

  // Process the file...
  await processFile(file);

  res.status(201).json({ status: 'created' });
});
```

---

## Response Format

While not strictly required, we recommend returning JSON responses:

### Success

```json
{
  "status": "ok"
}
```

### Error

```json
{
  "status": "error",
  "message": "Description of what went wrong"
}
```
