Binary File Support
===================

> **STATUS: COMPLETED**

# Summary

This milestone introduces support for binary files in Docora notifications. Binary files are detected automatically, encoded in Base64, and delivered to client apps. Large files are split into chunks to handle memory constraints and HTTP payload limits.

# Goals

- Automatically detect binary vs text files
- Encode binary content as Base64 in webhook payloads
- Implement chunked delivery for large files
- Maintain backward compatibility for text files

# User Story

As an onboarded app, I want to receive binary files (images, PDFs, videos, etc.) from my monitored repositories so I can process all repository content, not just text files.

# Scope

## Included

- Binary file detection using `isbinaryfile` package
- Base64 encoding for binary content
- Chunked delivery for files exceeding threshold
- Sequential chunk delivery with retry support
- New payload fields: `content_encoding`, `chunk`
- Configurable chunk threshold and size

---

# API Contract

## Payload Changes

### Text Files (unchanged, backward compatible)

```json
{
  "file": {
    "path": "src/index.ts",
    "sha": "abc123...",
    "size": 1234,
    "content": "import express from 'express';\n..."
  }
}
```

### Binary Files (small, single payload)

```json
{
  "file": {
    "path": "assets/logo.png",
    "sha": "def456...",
    "size": 50000,
    "content": "iVBORw0KGgoAAAANSUhEUgAA...",
    "content_encoding": "base64"
  }
}
```

### Binary Files (large, chunked)

Each chunk is sent as a separate HTTP request to the same endpoint (`/create` or `/update`):

```json
{
  "repository": {
    "repository_id": "repo_abc123",
    "github_url": "https://github.com/owner/repo",
    "owner": "owner",
    "name": "repo"
  },
  "file": {
    "path": "assets/video.mp4",
    "sha": "789xyz...",
    "size": 52428800,
    "content": "<base64 encoded chunk>",
    "content_encoding": "base64",
    "chunk": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "index": 0,
      "total": 100
    }
  },
  "commit_sha": "a1b2c3d4...",
  "timestamp": "2025-01-11T12:00:00Z"
}
```

### Chunk Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier for this file transfer |
| `index` | number | Zero-based chunk index |
| `total` | number | Total number of chunks |

---

## Delivery Behavior

### Non-Chunked Files

- Single HTTP request per file
- Existing retry logic applies

### Chunked Files

1. Chunks sent sequentially: index 0, 1, 2, ...
2. Wait for 2xx response before sending next chunk
3. On failure: retry current chunk with exponential backoff
4. After max retries: mark notification as failed, stop sending remaining chunks
5. All chunks use the same `chunk.id` for correlation

---

## Client Reassembly (Documentation Only)

Clients are responsible for reassembling chunked files:

1. Detect chunked payload by presence of `chunk` object
2. Buffer chunks by `chunk.id`
3. When all chunks received (`index` 0 to `total-1`), concatenate `content` strings
4. Decode concatenated Base64 to binary
5. Implement timeout for incomplete transfers (recommended: 5 minutes)

**Example pseudocode:**

```javascript
const transfers = new Map(); // chunk.id -> { chunks: [], total: N }

function handleWebhook(payload) {
  if (!payload.file.chunk) {
    // Non-chunked file, process directly
    return processFile(payload.file);
  }

  const { id, index, total } = payload.file.chunk;

  if (!transfers.has(id)) {
    transfers.set(id, { chunks: new Array(total), received: 0, total });
  }

  const transfer = transfers.get(id);
  transfer.chunks[index] = payload.file.content;
  transfer.received++;

  if (transfer.received === transfer.total) {
    const fullBase64 = transfer.chunks.join('');
    const binary = Buffer.from(fullBase64, 'base64');
    transfers.delete(id);
    return processFile({ ...payload.file, content: binary });
  }
}
```

---

# Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BINARY_CHUNK_THRESHOLD_BYTES` | 1048576 (1MB) | Files larger than this are chunked |
| `BINARY_CHUNK_SIZE_BYTES` | 524288 (512KB) | Raw bytes per chunk (before Base64) |

---

# Implementation Phases

## Phase 1: Dependencies

```bash
pnpm add isbinaryfile
```

---

## Phase 2: Binary Detection Utility

**File to create:** `src/utils/binary.ts`

```typescript
import { isBinaryFile } from 'isbinaryfile';

export async function isBinary(filePath: string): Promise<boolean>;
export async function isBinary(buffer: Buffer): Promise<boolean>;
```

---

## Phase 3: Update Scanner Service

**File to modify:** `src/services/scanner.ts`

Changes:
- Detect binary files during scan
- Read binary content as Buffer (not string)
- Add `isBinary: boolean` to `ScannedFile` interface

```typescript
export interface ScannedFile {
  path: string;
  sha: string;
  size: number;
  content: string | Buffer;  // Buffer for binary
  isBinary: boolean;         // NEW
}
```

---

## Phase 4: Chunking Utility

**File to create:** `src/utils/chunking.ts`

```typescript
export interface ChunkInfo {
  id: string;
  index: number;
  total: number;
}

export interface FileChunk {
  content: string;  // Base64 encoded chunk
  chunk: ChunkInfo;
}

export function shouldChunk(size: number): boolean;
export function createChunks(buffer: Buffer): FileChunk[];
```

---

## Phase 5: Update Notifier Service

**File to modify:** `src/services/notifier.ts`

Changes:
- Handle binary files: encode as Base64
- Add `content_encoding` field when Base64
- For large files: split into chunks, send sequentially
- Wait for 2xx before next chunk
- On chunk failure: retry, then fail entire file

New function signature:

```typescript
export async function sendFileNotification(
  baseUrl: string,
  endpoint: 'create' | 'update' | 'delete',
  payload: FilePayload,
  appId: string,
  clientAuthKey: string,
  file: ScannedFile  // Now includes isBinary flag
): Promise<void>;
```

---

## Phase 6: Update Snapshot Worker

**File to modify:** `src/workers/snapshot.worker.ts`

Changes:
- Pass `isBinary` flag through the notification flow
- Handle chunked delivery errors (partial transfer failure)

---

## Phase 7: Zod Schema Updates

**File to modify:** `src/schemas/notifications.ts` (or create if not exists)

Add schemas for:
- `ChunkSchema`
- `FilePayloadSchema` with optional `content_encoding` and `chunk`

---

## Phase 8: Testing

**Files to create:**

| File | Purpose |
|------|---------|
| `tests/utils/binary.test.ts` | Binary detection tests |
| `tests/utils/chunking.test.ts` | Chunking logic tests |
| `tests/services/notifier.binary.test.ts` | Binary notification tests |

**Test cases:**
- Text file → no encoding, no chunk
- Small binary → Base64, no chunk
- Large binary → Base64, chunked
- Chunk failure → retry, eventual failure
- Various file types (PNG, PDF, MP4, etc.)

---

## Phase 9: Documentation

**Files to update:**

| File | Changes |
|------|---------|
| `docs/project_documentation.md` | Add binary file support section |
| `docs/technical_specification.md` | Add new env vars, payload formats |
| `.env.example` | Add `BINARY_CHUNK_*` variables |

---

# File Structure

```
src/
├── services/
│   ├── scanner.ts              (MODIFY - binary detection)
│   └── notifier.ts             (MODIFY - Base64, chunking)
├── utils/
│   ├── binary.ts               (NEW)
│   └── chunking.ts             (NEW)
├── schemas/
│   └── notifications.ts        (NEW or MODIFY)
└── workers/
    └── snapshot.worker.ts      (MODIFY)

tests/
├── utils/
│   ├── binary.test.ts          (NEW)
│   └── chunking.test.ts        (NEW)
└── services/
    └── notifier.binary.test.ts (NEW)
```

---

# Acceptance Criteria

- [ ] Binary files detected automatically using `isbinaryfile`
- [ ] Binary content encoded as Base64 in payloads
- [ ] `content_encoding: "base64"` present for binary files
- [ ] Text files unchanged (backward compatible)
- [ ] Files > `BINARY_CHUNK_THRESHOLD_BYTES` are chunked
- [ ] Chunks sent sequentially, waiting for 2xx
- [ ] Chunk failure triggers retry with backoff
- [ ] `chunk` object includes `id`, `index`, `total`
- [ ] Environment variables documented in `.env.example`
- [ ] Client reassembly documented
- [ ] All tests pass

---

# Verification

1. **Setup:**
   ```bash
   # Use low threshold for testing
   BINARY_CHUNK_THRESHOLD_BYTES=10000 pnpm dev
   ```

2. **Test small binary:**
   - Add small image (< 10KB) to monitored repo
   - Verify `/create` called with `content_encoding: "base64"`, no `chunk`

3. **Test large binary:**
   - Add large image (> 10KB with test threshold) to monitored repo
   - Verify multiple `/create` calls with same `chunk.id`
   - Verify `index` goes from 0 to `total-1`

4. **Test text file (regression):**
   - Add `.ts` file to repo
   - Verify no `content_encoding` field (or `"plain"`)
   - Verify no `chunk` object

5. **Test chunk failure:**
   - Configure unreachable `base_url`
   - Verify retry attempts on chunk
   - Verify eventual failure status

6. **Client reassembly test:**
   - Create mock client that reassembles chunks
   - Verify reassembled binary matches original SHA
