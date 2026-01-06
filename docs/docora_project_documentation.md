# Docora

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

Upon registration, Docora issues:
- `client_id`
- `client_secret`

Clients must expose APIs defined by Docora for:
- initial snapshot delivery
- change notifications
- error notifications

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

1. Docora scans the full repository
2. Applies `.docoraignore`
3. Computes file hashes
4. Applies plugins (if configured)
5. Sends snapshot to client

This snapshot is the **source of truth** for subsequent updates.

---

## Change Detection

Docora detects:
- `FILE_ADDED`
- `FILE_REMOVED`
- `FILE_MODIFIED`

Detection is hash-based and non-semantic.

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

Docora calls client APIs directly.

Payloads include:
- raw or transformed file data
- change metadata
- plugin results
- mapping between original and transformed files

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

