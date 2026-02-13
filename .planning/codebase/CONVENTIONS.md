# Coding Conventions

**Analysis Date:** 2026-01-26

## Naming Patterns

**Files:**
- Services: `{service-name}.ts` (e.g., `scanner.ts`, `notifier.ts`, `change-detector.ts`)
- Repositories: `{entity-name}.ts` (e.g., `apps.ts`, `snapshots.ts`, `deliveries.ts`)
- Routes: `{endpoint}.ts` (e.g., `health.ts`, `register.ts`)
- Database types: `{table-name}.ts` (e.g., `apps.ts`, `repositories.ts`)
- Utilities: `{function-area}.ts` (e.g., `signature.ts`, `crypto.ts`, `chunking.ts`)
- Workers: `{job-type}.{worker-type}.ts` (e.g., `snapshot.worker.ts`, `snapshot.scheduler.ts`)

**Functions:**
- camelCase for all functions: `sendFileNotification()`, `scanRepository()`, `generateSignedHeaders()`
- Verb-first for action functions: `detect`, `send`, `record`, `get`, `create`, `update`, `delete`
- Handler functions: `{verb}{Noun}` (e.g., `buildServer()`, `registerRoutes()`)

**Variables:**
- camelCase for all variables: `appId`, `appName`, `baseUrl`, `fileSize`
- Constants use UPPER_SNAKE_CASE: `MAX_RETRY_ATTEMPTS`, `SNAPSHOT_QUEUE_NAME`, `EXCLUDED_DIRS`
- Boolean variables use `is`/`should`/`has` prefix: `isBinary`, `shouldRetry`, `hasMatch`
- Maps use plural names: `deliveredFiles`, `previousFiles`, `changes`

**Types:**
- PascalCase for interfaces: `ScannedFile`, `RepositoryInfo`, `NotificationResult`
- Type aliases use PascalCase: `ContentEncoding`, `NotificationEndpoint`, `RunMode`
- Suffixes: `Result`, `Data`, `Payload`, `Response`, `Request` (e.g., `NotificationResult`, `FileNotificationPayload`)

## Code Style

**Formatting:**
- TypeScript compilation target: ES2022
- Module resolution: NodeNext with ESM output
- Line length: No strict limit, but aim for readability
- Indentation: 2 spaces (inferred from code samples)

**Linting:**
- Tool: Built-in TypeScript strict mode
- Settings enforced:
  - `strict: true` - Full strict type checking
  - `noUnusedLocals: true` - Error on unused variables
  - `noUnusedParameters: true` - Error on unused parameters
  - `noImplicitReturns: true` - All functions must return explicitly
  - `forceConsistentCasingInFileNames: true` - Prevent case-sensitivity issues
  - `skipLibCheck: true` - Skip type checking of declaration files

**Comments:**
- Block comments with ASCII art used for feature documentation
- Example from `src/services/scanner.ts`:
  ```typescript
  /**
   ┌──────────────────┬───────────────────────────────────┐
   │     Feature      │          Implementation           │
   ├──────────────────┼───────────────────────────────────┤
   │ Hash algorithm   │ SHA-256 (64 char hex)             │
   ├──────────────────┼───────────────────────────────────┤
   │ Binary detection │ isbinaryfile package              │
   └──────────────────┴───────────────────────────────────┘
  */
  ```
- JSDoc comments for functions with parameter and return documentation
- Inline comments for complex logic

## Import Organization

**Order:**
1. Standard library imports (`fs`, `crypto`, `path`)
2. Third-party packages (`fastify`, `axios`, `bullmq`)
3. Type imports (`import type { ... }`)
4. Relative imports from application (`./`, `../`)

**Path Format:**
- ES modules require `.js` extension even for TypeScript source files
- Examples: `import { getDatabase } from "../db/index.js"`
- This is critical because TypeScript compiles `.ts` → `.js` and the runtime expects the `.js` extension

**Example from `src/server.ts`:**
```typescript
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { registerRoutes } from "./routes/index.js";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { registerSwagger } from "./plugins/swagger.js";
import authPlugin from "./plugins/auth.js";
```

## Error Handling

**Strategy:** Fail fast with explicit error messages

**Patterns:**
- Wrap potential failures in try-catch blocks
- Throw descriptive errors with context: `throw new Error("DATABASE_URL environment variable is required")`
- Return structured result objects with `success`, `error`, `shouldRetry` properties
- Example from `src/services/notifier.ts`:
  ```typescript
  export interface NotificationResult {
    success: boolean;
    statusCode?: number;
    error?: string;
    shouldRetry: boolean;
  }
  ```
- For transient failures, include `shouldRetry` flag to indicate if job should be retried
- Network errors use unified retry strategy: any non-2xx response triggers retry

**Error Propagation:**
- Database errors: throw and let worker catch and retry
- Network errors in notifier: return failure result with `shouldRetry: true`
- Validation errors: return 400/401 HTTP responses with error message

## Logging

**Framework:** Node.js `console` module (Fastify has built-in logging via Pino)

**Patterns:**
- `console.log()` for informational messages (normal flow)
- `console.debug()` for detailed diagnostic info (auth token lengths, app counts)
- `console.warn()` for recoverable issues (file read failures)
- `console.error()` for critical failures (shutdown errors, worker errors)

**Log Prefixes:**
- Auth logs use `[AUTH]` prefix
- Worker logs use `[{appName}-{appId}]` prefix for job tracking
- Example: `[docora-app_123] File notification sent successfully`

**Logging Guidelines:**
- Log at job entry/exit points
- Log state transitions (running, completed, failed)
- Log file operations with counts and summary stats
- Example from `src/services/scanner.ts`:
  ```typescript
  console.log(
    `Scanned ${scannedFiles.length} files (${textCount} text, ${binaryCount} binary) from ${repoPath}`
  );
  ```

## Function Design

**Size:**
- Target: Under 150 lines per file (per CLAUDE.md)
- Single responsibility principle enforced
- Functions should do one thing well

**Parameters:**
- Prefer objects over multiple positional parameters for 3+ arguments
- Example:
  ```typescript
  export function generateSignedHeaders(
    appId: string,
    body: object,
    secret: string,
    timestamp?: number
  ): SignedHeaders
  ```

**Return Values:**
- Explicit typed returns (no implicit `any`)
- Use `Promise<T>` for async functions
- Return result objects for complex operations (with `success`, `error`, `data` fields)

## Module Design

**Exports:**
- Named exports preferred over default exports
- Example: `export function scanRepository()` not `export default scanRepository`
- Type exports use `export type` or `export interface`

**Barrel Files:**
- Route aggregation in `src/routes/index.ts`:
  ```typescript
  export async function registerRoutes(server: FastifyInstance): Promise<void> {
    await server.register(healthRoutes);
    await server.register(versionRoutes);
    await server.register(appsRoutes);
    await server.register(repositoriesRoutes);
  }
  ```

**Services vs Repositories:**
- `services/`: Business logic (scanner, notifier, git operations)
- `repositories/`: Data access layer (database CRUD)
- Clear separation for testability and dependency injection

## Convention Examples

**Service Pattern (`src/services/scanner.ts`):**
```typescript
export interface ScannedFile {
  path: string;
  sha: string;
  size: number;
  content: string;
  isBinary: boolean;
  contentEncoding: ContentEncoding;
}

export async function scanRepository(repoPath: string): Promise<ScannedFile[]> {
  // Implementation
}
```

**Repository Pattern (`src/repositories/apps.ts`):**
```typescript
export async function createApp(
  data: OnboardRequest
): Promise<OnboardResponse> {
  const db = getDatabase();
  // Insert and return result
}
```

**Async/Await Pattern:**
- Always use `async/await` for async operations
- Never use `.then()` chains
- Use `try/catch` for error handling

---

*Convention analysis: 2026-01-26*
