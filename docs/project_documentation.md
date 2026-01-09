project documentation
=====================

## Overview
Docora is a headless service that monitors GitHub repositories, detects structural file changes, optionally applies transformation plugins, and notifies registered client applications through a well-defined API.

Docora does **not** interpret or validate file semantics. It treats repositories as collections of files and directories and operates purely on their structure and content hashes.

---

## Core Principles

- **Repository-agnostic**: All file types are supported
- **GitHub-first**: GitHub is the only supported provider (v1)
- **Branch-locked**: Only the `main` branch is monitored
- **Push-based**: Docora notifies clients, never the opposite
- **Deterministic**: Same input state → same output
- **Non-intrusive**: Docora never writes back to repositories
- **Plugin-driven**: Transformations are explicit and optional

---

## High-Level Architecture

### Components

- **API Server**
  - Client registration
  - Repository registration
  - Configuration management

- **Repository Monitor**
  - Periodic scans of GitHub repositories
  - Change detection via hash comparison

- **Snapshot Engine**
  - Builds full repository state
  - Applies `.docoraignore`

- **Plugin Pipeline**
  - Applies ordered, parametric transformations
  - Produces derived file representations

- **Notification Dispatcher**
  - Calls client-defined APIs
  - Handles retries and failures

- **Monitoring & Observability**
  - Logs
  - Metrics
  - Audit events

---

## Repository Monitoring Model

### Scope
- Provider: GitHub
- Branch: `main`
- Files monitored: all

### Ignoring Files

Docora supports a `.docoraignore` file at repository root.

- Syntax inspired by `.gitignore`
- Excludes files and directories from:
  - snapshots
  - scans
  - notifications

---

## Client Registration

Clients must register to:
- receive repository snapshots
- receive change notifications

### Onboarding Request

Clients provide:
- `base_url` - Webhook URL for receiving notifications
- `app_name` - Application name
- `email` - Contact email
- `client_auth_key` - Secret key for HMAC webhook authentication

### Onboarding Response

Upon registration, Docora issues:
- `app_id` - Unique application identifier
- `token` - Bearer token for API authentication

### Required Client Endpoints

Clients must expose these endpoints at their `base_url`:
- `POST /create` - Receive new file notifications
- `POST /update` - Receive file modification notifications
- `POST /delete` - Receive file deletion notifications

---

## Repository Registration

Clients may register one or more repositories.

Each registration includes:
- GitHub repository URL
- Access token (if private)
- Optional plugin configuration

Repositories are isolated per client.

---

## Initial Snapshot

When a repository is registered:

1. Docora clones the repository locally
2. Applies `.docoraignore` exclusions
3. Scans all files, computing SHA-256 hashes
4. Applies plugins (if configured)
5. Sends `POST /create` for each file to the client

This snapshot is stored in the database and becomes the **source of truth** for subsequent change detection.

---

## Change Detection

Docora detects file changes by comparing the current repository scan with the previous snapshot:

- `created` - File exists in current scan but not in previous snapshot
- `updated` - File exists in both but SHA hash differs
- `deleted` - File exists in previous snapshot but not in current scan

Detection is hash-based (SHA-256) and non-semantic. Changes are processed in order: delete → create → update.

---

## Plugin System

### Purpose
Plugins allow transformation of repository contents **before notification**.

### Characteristics
- Optional
- Explicit per repository
- Parametric
- Deterministic
- Versioned

### Execution Model

1. Change set detected
2. Plugin pipeline executed (ordered)
3. Transformed output generated
4. Client notified with transformed data

---

## Supported Plugins

### `embed-images` (v1)

Transforms Markdown files so that:
- local image references are replaced
- image identifiers are derived from file hashes

Effects:
- File content may change
- Logical filename may change
- Original repository remains untouched

---

## Notification Model

Docora calls client APIs directly using granular endpoints for each change type:

### Endpoints

- `POST {base_url}/create` - Called when a new file is detected
- `POST {base_url}/update` - Called when an existing file is modified
- `POST {base_url}/delete` - Called when a file is removed

### Authentication

All webhook requests are authenticated using HMAC signatures:

```
X-Docora-App-Id: {app_id}
X-Docora-Signature: sha256={hmac_signature}
X-Docora-Timestamp: {unix_timestamp}
```

The `client_auth_key` (provided during onboarding) is used to compute the signature but is **never transmitted** after the initial registration.

### Payloads

Each notification includes:
- Repository metadata (id, url, owner, name)
- File data (path, sha, size, content for create/update)
- Commit SHA
- Timestamp
- Previous SHA (for updates only)

---

## Monitoring & Observability

Docora provides internal monitoring for maintainers.

Tracked events:
- GitHub access errors
- Scan failures
- Plugin execution failures
- Notification delivery issues
- Client misconfiguration

Goal: full traceability of **what happened, where, and why**.

---

## Non-Goals (v1)

- No polling APIs
- No client acknowledgements
- No multi-branch support
- No multi-provider support
- No semantic file validation

---

## Technology Stack (Planned)

- Language: TypeScript
- Runtime: Node.js
- Containerization: Docker
- Architecture: API-first, headless service

---

## Positioning

> Docora is a repository observation and transformation engine.
> It turns Git repositories into deterministic, client-ready data streams.

