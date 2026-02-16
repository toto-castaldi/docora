---
title: "Docora"
subtitle: "Headless GitHub repository monitoring with push-based file notifications"
---

## What is Docora?

Docora is a headless service that monitors GitHub repositories and sends real-time HTTP notifications to your application when files change. It detects structural file changes using hash-based comparison (SHA-256), not semantic parsing, so it works with any file type: code, configs, images, documents, and binaries.

Your application registers repositories to watch. Docora handles the scanning, change detection, and delivery. When something changes, you get an HTTP POST with the full file content and metadata.

## How It Works

1. **Onboard your app** -- Register with Docora to receive an app ID and bearer token. Docora uses these credentials to authenticate your API calls and sign webhook deliveries.

2. **Watch repositories** -- Tell Docora which GitHub repositories to monitor. You can watch public repositories directly or provide a GitHub token for private ones.

3. **Receive notifications** -- Docora scans repositories on a schedule and POSTs file changes (create, update, delete) to your webhook URL with HMAC-SHA256 signatures for verification.

4. **Handle failures** -- If syncing fails repeatedly, Docora's circuit breaker opens and sends a `sync_failed` alert so you can rotate tokens or investigate the issue.

## Key Features

- **Push-based delivery** -- no polling needed, Docora sends changes to you
- **HMAC-SHA256 signed webhooks** -- verify every request is authentic
- **Automatic binary file detection** -- images and binaries are Base64 encoded
- **Chunked delivery** -- large files (>1MB) are split into manageable pieces
- **Circuit breaker** -- persistent failures trigger `sync_failed` notifications
- **Token rotation** -- update GitHub tokens without re-registering repositories
- **.docoraignore** -- exclude files and patterns from monitoring

## Get Started

<div class="get-started">
  <a href="/api/" class="get-started-card">
    <h3>API Documentation</h3>
    <p>Learn how to register your app and manage repositories</p>
  </a>
  <a href="/webhooks/" class="get-started-card">
    <h3>Webhook Reference</h3>
    <p>Understand the notifications Docora sends to your app</p>
  </a>
</div>
