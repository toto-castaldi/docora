---
status: testing
phase: 05-production-hardening
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md
started: 2026-02-13T22:00:00Z
updated: 2026-02-13T22:00:00Z
---

## Current Test

number: 1
name: CSP Headers Present
expected: |
  Open the dashboard in Chrome, open DevTools (F12) > Network tab. Reload the page.
  Click on the main document request. In the Response Headers, you should see a
  `Content-Security-Policy` header with directives including `default-src 'self'`,
  `object-src 'none'`, and `frame-ancestors 'none'`.
awaiting: user response

## Tests

### 1. CSP Headers Present
expected: Open DevTools > Network tab, reload dashboard. Response headers include Content-Security-Policy with default-src 'self', object-src 'none', frame-ancestors 'none'.
result: [pending]

### 2. Login Rate Limiting
expected: On the login page, submit wrong credentials rapidly 5+ times within a minute. After 5 failed attempts, the next attempt should return a rate limit error (HTTP 429 or similar message) instead of the normal "invalid credentials" response.
result: [pending]

### 3. Error Handler Hides Server Internals
expected: If a 5xx server error occurs, the response body should show a generic message like "Internal Server Error" — no stack traces, no file paths, no internal details leaked.
result: [pending]

### 4. ErrorBoundary Recovery on Navigation
expected: If a page crashes due to a render error, you should see a recovery UI with an AlertTriangle icon, error message, and "Try again" button. Clicking a different page in the sidebar should recover the app (navigate away from the crashed page).
result: [pending]

### 5. Overview Page Error State
expected: If the backend API is unreachable (e.g., backend stopped), the Overview page should display "Failed to load dashboard metrics" with a retry button, instead of a blank page or unhandled error.
result: [pending]

### 6. Queue Page Error State
expected: If the backend API is unreachable, the Queue page should display "Failed to load queue status" with a retry button, instead of a blank page or unhandled error.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
