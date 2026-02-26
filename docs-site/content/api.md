---
title: "API Reference"
---

<div class="intro">

Docora exposes a REST API for repository management. All endpoints require bearer token authentication. App onboarding is admin-only and performed through the Docora admin dashboard.

</div>

## Authentication

All requests require an `Authorization` header with the bearer token you received during onboarding:

```
Authorization: Bearer docora_abcdef123456...
```

#### curl Example

```bash
curl -X POST https://your-docora-instance/api/repositories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer docora_abcdef123456..." \
  -d '{"github_url": "https://github.com/owner/repo"}'
```

<div class="alert alert-important">
<strong>Keep your token secret.</strong> The bearer token authenticates all your API calls. Do not expose it in client-side code, logs, or public repositories.
</div>

---

## POST /api/repositories

Register a GitHub repository for Docora to monitor. Docora validates the repository exists and is accessible, then begins scanning for files.

<div class="endpoint">
<span class="badge badge-post">POST</span> <code>/api/repositories</code>
</div>

**Requires:** `Authorization: Bearer <token>`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `github_url` | string | Yes | GitHub repository URL (`https://github.com/owner/repo`) |
| `github_token` | string | No | GitHub personal access token (required for private repos, starts with `ghp_` or `github_pat_`) |

```json
{
  "github_url": "https://github.com/owner/repo",
  "github_token": "ghp_xxxxxxxxxxxx"
}
```

### Response (201 Created)

| Field | Type | Description |
|-------|------|-------------|
| `repository_id` | string | Docora repository identifier |
| `github_url` | string | Full GitHub URL |
| `owner` | string | Repository owner |
| `name` | string | Repository name |
| `is_private` | boolean | Whether the repository is private |
| `created_at` | string | ISO 8601 creation timestamp |

```json
{
  "repository_id": "repo_abc123def456",
  "github_url": "https://github.com/owner/repo",
  "owner": "owner",
  "name": "repo",
  "is_private": false,
  "created_at": "2025-01-08T12:00:00Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 401 | Unauthorized -- missing or invalid bearer token |
| 404 | Repository not found on GitHub (or token lacks access) |
| 422 | Invalid GitHub URL format |

<div class="alert alert-info">
<strong>Re-registration:</strong> Registering a repository your app already watches will unwatch it first and re-register it, triggering a fresh full scan.
</div>

---

## DELETE /api/repositories/:repository_id

Stop watching a repository and clean up delivery history for your app.

<div class="endpoint">
<span class="badge badge-delete">DELETE</span> <code>/api/repositories/:repository_id</code>
</div>

**Requires:** `Authorization: Bearer <token>`

### Path Parameters

| Parameter | Format | Description |
|-----------|--------|-------------|
| `repository_id` | `repo_` + 24 hex characters | Docora repository identifier |

### Response (204 No Content)

No response body on success.

### Error Responses

| Status | Description |
|--------|-------------|
| 401 | Unauthorized -- missing or invalid bearer token |
| 404 | Repository not found or not registered for this app |

---

## PATCH /api/repositories/:repository_id/token

Update the GitHub personal access token for a watched repository. This resets any error state and circuit breaker, triggering a fresh scan.

<div class="endpoint">
<span class="badge badge-patch">PATCH</span> <code>/api/repositories/:repository_id/token</code>
</div>

**Requires:** `Authorization: Bearer <token>`

### Path Parameters

| Parameter | Format | Description |
|-----------|--------|-------------|
| `repository_id` | `repo_` + 24 hex characters | Docora repository identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `github_token` | string | Yes | New GitHub personal access token (starts with `ghp_` or `github_pat_`) |

```json
{
  "github_token": "ghp_xxxxxxxxxxxx"
}
```

### Response (200 OK)

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | `"Token updated successfully"` |

```json
{
  "message": "Token updated successfully"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 401 | Unauthorized -- missing or invalid bearer token |
| 404 | Repository not found or not registered for this app |
| 422 | Token cannot access this repository |

<div class="alert alert-info">
<strong>When to use:</strong> If you receive a <a href="/webhooks/#post-sync_failed">sync_failed webhook</a>, use this endpoint to rotate the token and restore syncing.
</div>

---

## Error Responses

All error responses follow the same structure:

```json
{
  "error": "Description of what went wrong"
}
```

### Common Status Codes

| Status | Description |
|--------|-------------|
| 401 | Unauthorized -- missing or invalid bearer token |
| 404 | Resource not found |
| 422 | Validation error -- invalid input data |
| 500 | Internal server error |
