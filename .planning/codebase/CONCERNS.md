# Codebase Concerns

**Analysis Date:** 2026-01-26

## Tech Debt

**Large file operations in synchronous context:**
- Issue: `src/services/scanner.ts` uses synchronous file operations (`readFileSync`, `readdirSync`, `statSync`) during repository scanning. For large repositories, this blocks the event loop and memory accumulation of all file content in the scanning phase.
- Files: `src/services/scanner.ts` (lines 47-89)
- Impact: Scanning a large repository (>1000 files) may cause memory spikes and server unresponsiveness. Binary files especially consume memory as Base64-encoded content stored in memory before transmission.
- Fix approach: Convert to async file operations using promises or streams. Implement streaming file transmission instead of loading entire content into memory. Consider resumable uploads for very large files.

**All file content loaded into memory before transmission:**
- Issue: `scanRepository()` reads all files (including large binaries) into memory and stores content as strings. Content remains in memory throughout scanning and change detection phases.
- Files: `src/services/scanner.ts` (lines 75-113), `src/workers/snapshot.worker.ts` (line 189)
- Impact: A 50MB binary file gets Base64-encoded (33% larger) and held in memory. Multiple large files can exhaust available memory in containerized environments with 256MB-512MB limits.
- Fix approach: Implement streaming/chunked reading that processes files in batches. For binary files, consider computing hashes without loading full content. Use generators or async iterables.

**No verification of encrypted token format integrity:**
- Issue: `src/utils/crypto.ts` `decryptToken()` splits encrypted data by `:` without validating format before decryption attempt. Malformed tokens fail during decryption with cryptic errors.
- Files: `src/utils/crypto.ts` (lines 40-59)
- Impact: Invalid encrypted tokens in database cause silent failures during job processing. Errors are caught but logged without clear distinction between format errors vs. decryption failures.
- Fix approach: Add format validation before splitting and decryption. Throw specific error types for format vs. crypto failures. Add safeguards for edge cases like empty parts.

**Missing ENCRYPTION_KEY validation at startup:**
- Issue: `src/utils/crypto.ts` `getEncryptionKey()` validates key length but startup proceeds if key is invalid. Error only surfaces during first encryption/decryption call.
- Files: `src/utils/crypto.ts` (lines 6-18), `src/index.ts` (main entry)
- Impact: Service can start successfully without a valid encryption key, only failing when processing first app or repository. Reduces observability in production.
- Fix approach: Add key validation in `initDatabase()` or a new `initCrypto()` call. Fail startup immediately with clear error message.

**Circuit breaker state not persisted across failures:**
- Issue: Circuit breaker uses database columns but state resets on service restart. If a repository consistently fails, the service will retry it aggressively on each restart instead of respecting the cooldown period.
- Files: `src/repositories/repositories.ts` (lines 388-423), `src/workers/snapshot.worker.ts` (lines 177-186)
- Impact: Flaky or rate-limited repos trigger repeated failed scans on restart, potentially damaging their rate limits further. No awareness of "just failed" on restart.
- Fix approach: Initialize `circuit_open_until` check on worker startup. Consider adding a recovery strategy that gradually increases retry backoff.

**No cleanup of stale local repositories on disk:**
- Issue: When a repository is orphaned and deleted from database, only `deleteLocalRepository()` is called. But if the deletion fails silently, the clone remains on disk indefinitely, wasting storage.
- Files: `src/services/git.ts` (lines 131-142), `src/services/repository-management.ts` (lines 37-45)
- Impact: Over time, `/data/repos` can accumulate abandoned clones from failed deletion operations. No alert when storage usage exceeds limits.
- Fix approach: Implement disk cleanup job that detects orphaned clones not in database. Add monitoring for `/data/repos` size and alert on growth spikes.

---

## Security Considerations

**GitHub tokens embedded in authenticated Git URLs:**
- Risk: `buildAuthenticatedUrl()` in `src/services/git.ts` creates URL-encoded credentials. If git command fails, stderr output or logs may contain the token. simple-git logs operations which could expose tokens.
- Files: `src/services/git.ts` (lines 40-51, 56-103)
- Current mitigation: Tokens are encrypted at rest in database. But they're decrypted during job processing and passed as URL credentials.
- Recommendations: Use SSH keys instead of HTTPS with token embedding. If HTTPS required, use git credential helpers or config files instead of URL encoding. Sanitize git command stderr before logging.

**Encryption key must be 64-char hex string:**
- Risk: `src/utils/crypto.ts` requires `ENCRYPTION_KEY` as 64-char hex but doesn't validate this at startup. Invalid keys silently fail during encryption, then crypto exceptions bubble up unpredictably.
- Files: `src/utils/crypto.ts` (lines 6-18), `.env.example` (line 10)
- Current mitigation: None - depends on operational discipline to generate correct key
- Recommendations: Generate key validation during `initDatabase()` phase. Provide CLI tool to generate valid keys. Document key format in README with examples.

**SSRF validation bypassed in development mode:**
- Risk: `src/utils/url-validator.ts` disables all validation when `NODE_ENV=dev`, allowing any base_url including localhost and private IPs. If dev credentials leak or dev mode accidentally deployed, internal services become accessible.
- Files: `src/utils/url-validator.ts` (lines 12-46), `.env.example` (line 1)
- Current mitigation: Only affects development environment
- Recommendations: Remove NODE_ENV-based bypass. Use separate allowlist for dev environments instead. Enforce HTTPS validation in all modes except local (127.0.0.1 only).

**No rate limiting on public endpoints:**
- Risk: `/api/apps/onboard` endpoint is public (`publicAccess: true`) with no rate limiting configured.
- Files: `src/routes/apps/onboard.ts` (line 19), `src/server.ts`
- Current mitigation: Fastify has rate-limit plugin available but not configured
- Recommendations: Enable `@fastify/rate-limit` with sensible defaults (e.g., 10 requests/minute per IP). Consider CAPTCHA for repeated onboarding attempts from same IP.

**No authentication validation on repository register endpoint:**
- Risk: `/api/repositories` endpoint allows any caller to register repos and link apps without proving ownership of the repository or app.
- Files: `src/routes/repositories/register.ts`
- Current mitigation: Apps must have valid auth key to receive notifications, but registration itself has no validation
- Recommendations: Require Bearer token authentication on registration endpoints. Validate that caller owns or has permission to watch the repository (via GitHub OAuth/PAT scope check).

---

## Performance Bottlenecks

**N+1 queries in repository state tracking:**
- Problem: `src/repositories/repositories.ts` `findRepositoriesForRescan()` performs 3 separate queries (one with 2 INNER JOINs) to fetch repositories and their app data. For 1000 repos, this is a single query, but status updates happen per app-repo pair.
- Files: `src/repositories/repositories.ts` (lines 310-382)
- Cause: Each status update is a separate transaction. With concurrent workers, lock contention on the same records increases.
- Improvement path: Batch status updates using transaction with explicit locking. Use `FOR UPDATE` to prevent concurrent modifications. Consider read replicas for the scanning query.

**Chunk creation inefficiency for large binary files:**
- Problem: `src/utils/chunking.ts` creates all chunks at once before sending any. For a 100MB file chunked at 512KB, this creates 200 chunk objects in memory simultaneously.
- Files: `src/utils/chunking.ts` (lines 59-81)
- Cause: `createChunks()` doesn't use iterators; it generates complete array upfront
- Improvement path: Return generator function or async iterator for lazy chunk creation. Send chunks as they're produced. Reduce peak memory during large file transmission.

**Database connection pool configuration missing:**
- Problem: `src/db/index.ts` creates Kysely with default Pool settings. No explicit pool size, connection timeout, or idle timeout configured.
- Files: `src/db/index.ts` (lines 14-18)
- Cause: Under load with many concurrent jobs, connections may exhaust or hold indefinitely
- Improvement path: Set `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` in Pool constructor. Add connection pool metrics/monitoring.

**Missing indexes on frequently queried columns:**
- Problem: Snapshots and deliveries are queried by `app_id`, `repository_id` but no indexes mentioned in migrations.
- Files: Database schema (not visible but referenced in repositories)
- Cause: Full table scans on large tables
- Improvement path: Ensure indexes on `app_repositories.app_id`, `app_repositories.repository_id`, `snapshot_files.snapshot_id`. Add compound index on `app_repositories(app_id, repository_id)` for uniqueness checks.

---

## Fragile Areas

**File change detection order matters but isn't enforced:**
- Files: `src/services/change-detector.ts`, `src/workers/snapshot.worker.ts` (line 198)
- Why fragile: Changes are sorted (delete → create → update) but the order is implicit in `detectAndSortChanges()`. If this function changes order, notifications arrive in wrong sequence, confusing clients expecting delete-first semantics.
- Safe modification: Export the sort order as a constant. Document the contract explicitly. Add tests for sort order preservation.
- Test coverage: No test files exist for change detection logic (0 test files in `src/`).

**Notification failure causes entire job retry without partial delivery tracking:**
- Files: `src/workers/snapshot.worker.ts` (lines 252-280)
- Why fragile: If notification N fails, the entire job retries. Files already delivered for changes 1..N-1 aren't tracked as delivered until the job succeeds. Clients see duplicate notifications on retry.
- Safe modification: Record delivery immediately after each successful notification before moving to next change. Track partial delivery in a separate status column.
- Test coverage: No integration tests for retry scenarios.

**Git authentication falls back to URL embedding with no fallback strategy:**
- Files: `src/services/git.ts` (lines 40-51, 73-103)
- Why fragile: If GitHub changes their URL authentication format, all private repo clones fail. No fallback to SSH or credential helpers.
- Safe modification: Implement SSH key support as primary method. Use URL auth only as fallback. Add environment variable to select auth strategy.
- Test coverage: No mocked tests for git operations.

**Snapshot transaction assumes single snapshot per repo but no constraint enforces it:**
- Files: `src/repositories/snapshots.ts` (lines 47-90)
- Why fragile: `saveSnapshot()` checks if snapshot exists with a simple select, then updates or inserts. Between check and insert, another job could insert, causing duplicate snapshots for the same repo.
- Safe modification: Use database `UPSERT` (INSERT ... ON CONFLICT) instead of check-then-act. Or add UNIQUE constraint on `(repository_id)`.
- Test coverage: No test for concurrent snapshot writes.

---

## Test Coverage Gaps

**No unit tests for critical services:**
- What's not tested: All service logic in `src/services/` and `src/repositories/` has zero test coverage
- Files: `src/services/git.ts`, `src/services/scanner.ts`, `src/services/notifier.ts`, `src/services/change-detector.ts`, `src/repositories/*.ts`
- Risk: Refactoring or bug fixes in core logic have no safety net. Edge cases (malformed tokens, empty repos, network errors) not validated.
- Priority: High - these are the most critical paths

**No integration tests for snapshot job workflow:**
- What's not tested: End-to-end flow of cloning → scanning → detecting changes → notifying → persisting. Retry logic with different failure points.
- Files: `src/workers/snapshot.worker.ts`
- Risk: Jobs silently fail in complex scenarios (partial delivery, notification timeouts, database unavailability). Retry behavior untested.
- Priority: High - this is the core feature

**No tests for encryption/decryption:**
- What's not tested: Token encryption with various inputs (unicode, special chars, empty), decryption error handling, missing keys
- Files: `src/utils/crypto.ts`
- Risk: Subtle bugs in crypto handling go undetected (timing attacks, key reuse, incorrect padding)
- Priority: High - security-critical

**No tests for change detection logic:**
- What's not tested: File order preservation, handling of deleted files without previous snapshot, binary vs. text classification
- Files: `src/services/change-detector.ts`
- Risk: Changes processed in wrong order, files incorrectly classified, duplicates missed
- Priority: Medium - affects data correctness

**No tests for scheduler and queue behavior:**
- What's not tested: Job deduplication, retry backoff, circuit breaker, concurrent job limits
- Files: `src/workers/snapshot.scheduler.ts`
- Risk: Job storms, duplicate processing, infinite retries
- Priority: Medium - affects operational stability

---

## Scaling Limits

**Repository storage grows unbounded on disk:**
- Current capacity: Depends on `/data/repos` volume size (e.g., 100GB)
- Limit: When volume fills, cloneOrPull fails with ENOSPC. No graceful degradation.
- Scaling path: Implement cleanup of unmodified repos older than N days. Add monitoring for disk usage. Implement LRU eviction if repos exceed threshold. Use git shallow clones permanently to reduce storage.

**Database grows linearly with snapshot history:**
- Current capacity: For 1000 repos with 1000 files each, storing every snapshot creates millions of rows
- Limit: Queries slow as table grows. VACUUM and index bloat.
- Scaling path: Archive old snapshots after N days. Implement retention policy. Consider time-series database for snapshot history. Add indexes on (repository_id, scanned_at).

**Memory usage during large repository scans:**
- Current capacity: Content of all files loaded into memory simultaneously during scanning phase
- Limit: A 500MB repository will require 500MB+ memory per scanning instance. Multiple concurrent scans exhaust container memory limits.
- Scaling path: Switch to streaming file processing. Implement chunked file reads that never load more than 10MB at once. Reduce SCAN_CONCURRENCY if memory constrained.

**Redis queue size grows with pending jobs:**
- Current capacity: BullMQ default job retention (100 completed, 200 failed)
- Limit: Long-running jobs or failed jobs pile up. Redis memory grows. Queue inspection becomes slow.
- Scaling path: Implement more aggressive cleanup (removeOnComplete: 10, removeOnFail: 20). Archive old job data to PostgreSQL. Monitor queue size with alerts.

---

## Dependencies at Risk

**simple-git package with synchronous Git operations:**
- Risk: `simple-git` wraps synchronous git commands. No streaming support for large repos.
- Impact: Cloning a 10GB repo blocks the event loop for minutes. No streaming progress or cancellation.
- Migration plan: Consider `nodegit` for more direct control or migrate to `git` CLI directly with streaming. Or accept synchronous bottleneck and document constraints.

**axios for webhook notifications with no built-in retry:**
- Risk: Network failures to webhook endpoints are not retried. No circuit breaker at HTTP client level.
- Impact: Transient network glitches cause job retries and duplicate notifications to clients.
- Migration plan: Wrap axios with retry logic including exponential backoff and jitter. Consider using a dedicated HTTP client like `got` with built-in retry/retry-after support.

**isbinaryfile detection heuristic-based:**
- Risk: `isbinaryfile` package uses magic bytes and heuristics. Some files may be misclassified (binary as text or vice versa).
- Impact: Binary files transmitted as UTF-8 (corrupted), or text files sent as Base64 (wastes bandwidth).
- Migration plan: Add explicit file extension whitelist for text files. Validate detection with content inspection. Consider user-provided `.docora-types` file for overrides.

---

## Missing Critical Features

**No webhook delivery confirmation tracking:**
- Problem: After sending a notification, Docora doesn't track if the client app actually received and processed it. If app crashes after receiving but before ACKing, file is marked delivered even though client lost it.
- Blocks: Reliable delivery guarantee, allowing clients to request resync of specific files

**No support for non-main branch repositories:**
- Problem: `src/services/git.ts` hardcodes `--branch main` fetch and reset. Repos with `master` or custom default branch fail silently.
- Blocks: Watching repositories with non-main branch structures, GitHub Enterprise instances

**No .docoraignore support for filtering files:**
- Problem: All files except `.git/` are sent to apps, including `node_modules/`, build artifacts, secrets.
- Blocks: Reducing notification noise, preventing accidental secret leaks via large dependency trees

**No support for file renaming detection:**
- Problem: Rename is detected as delete + create (two notifications). Clients can't distinguish rename from separate operations.
- Blocks: Semantic file change tracking, efficient client-side syncing

---

## Known Bugs

**Git fetch hardcodes `main` branch:**
- Symptoms: Repositories using `master` or other default branches fail to pull updates
- Files: `src/services/git.ts` (line 81)
- Trigger: Register any repository not using `main` branch
- Workaround: Rename default branch to `main` on GitHub (destructive, affects all users)

**Chunked file sending doesn't validate chunk reassembly:**
- Symptoms: Client receives chunks but has no validation that all chunks arrived or in order
- Files: `src/services/chunked-notifier.ts` (lines 97-135)
- Trigger: Network packet loss during large file transmission
- Workaround: Client must validate chunk ID and index sequentially; missing chunks cause silent data corruption

---

## Operational Concerns

**Console logging without structured format:**
- Issue: All logging uses `console.log()` and `console.error()` with inline string formatting. No structured JSON output, no log levels configurable per module.
- Impact: Difficult to parse in production monitoring, no machine-readable timestamps or request IDs for tracing.
- Improvement: Implement structured logging with `pino` or `winston`. Add request correlation IDs. Support `LOG_LEVEL` environment variable per module.

**No health check endpoint for dependencies:**
- Issue: `/health` endpoint only returns uptime; doesn't check database, Redis, or GitHub API connectivity.
- Impact: Service can report healthy while unable to process jobs (database down, Redis unreachable).
- Improvement: Add checks for PostgreSQL connection, Redis connectivity, GitHub API reachability. Return 503 if critical dependencies unavailable.

**No graceful degradation when GitHub API rate limited:**
- Issue: `src/utils/github.ts` doesn't handle 429 responses or parse `Retry-After` header.
- Impact: When rate limited, all GitHub validation fails immediately without exponential backoff.
- Improvement: Implement exponential backoff with jitter on 429 responses. Cache GitHub API responses to reduce API calls.

---

*Concerns audit: 2026-01-26*
