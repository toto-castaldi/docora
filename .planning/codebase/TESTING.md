# Testing Patterns

**Analysis Date:** 2026-01-26

## Test Framework

**Runner:**
- Vitest 4.0.16
- Config: `vitest.config.ts`
- Globals enabled (no need to import `describe`, `it`, `expect`)
- Environment: Node.js (not jsdom)

**Assertion Library:**
- Vitest built-in expect API with standard matchers

**Run Commands:**
```bash
pnpm test              # Run all tests once
pnpm test:watch        # Run tests in watch mode
```

## Test File Organization

**Location:**
- Separate `/tests` directory (not co-located with source)
- Mirror source structure: `src/services/scanner.ts` → `tests/services/scanner.test.ts`
- Global setup available in `tests/setup.ts`

**Naming:**
- Format: `{module}.test.ts`
- Examples: `health.test.ts`, `change-detector.test.ts`, `notifier.test.ts`

**Structure:**
```
tests/
├── health.test.ts                    # Route tests
├── setup.ts                          # Global test setup
├── services/
│   ├── change-detector.test.ts
│   ├── notifier.test.ts
│   └── repository-management.test.ts
├── repositories/
│   └── deliveries.test.ts
├── routes/
│   └── repositories/
│       └── unwatch.test.ts
└── utils/
    ├── binary.test.ts
    ├── chunking.test.ts
    └── signature.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("module-name", () => {
  describe("function-name", () => {
    it("should do something specific", () => {
      // Arrange
      const input = "test";

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe("expected");
    });
  });
});
```

**Example from `tests/services/change-detector.test.ts`:**
- Nested `describe` blocks: outer for module, inner for function
- Descriptive test names starting with "should"
- One assertion per test (or grouped related assertions)
- Test data factories for repeated setup

**Setup/Teardown Pattern:**
```typescript
describe('GET /health', () => {
    afterAll(async () => {
        await closeTestServer();
    });

    it('should return 200 status', async () => {
        const server = await getTestServer();
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });
        expect(response.statusCode).toBe(200);
    });
});
```

## Mocking

**Framework:** Vitest's built-in mocking via `vi` module

**Module Mocking Pattern:**
```typescript
// Mock entire modules
vi.mock("../../src/db/index.js", () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from "../../src/db/index.js";
const mockedGetDatabase = vi.mocked(getDatabase);

describe("deliveries repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should test with mocked database", async () => {
    const mockExecute = vi.fn().mockResolvedValue([]);
    mockedGetDatabase.mockReturnValue({
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: mockExecute,
          }),
        }),
      }),
    } as any);

    // Test code
  });
});
```

**Third-party Mocking Pattern:**
```typescript
// Mock axios
vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("sendFileNotification", () => {
  it("should send POST request", async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200 });

    const result = await sendFileNotification(...);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://example.com/endpoint",
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });
});
```

**What to Mock:**
- External HTTP clients (axios)
- Database connections (in isolation tests)
- File system operations
- Cryptographic functions (when deterministic output needed for testing)

**What NOT to Mock:**
- Pure utility functions (crypto signature generation in unit tests)
- Data structures (ScannedFile, NotificationResult)
- Core business logic unless testing error paths

## Fixtures and Factories

**Test Data Factories:**
```typescript
// From tests/services/change-detector.test.ts
const makeFile = (path: string, sha: string): ScannedFile => ({
  path,
  sha,
  size: 100,
  content: "test content",
  isBinary: false,
  contentEncoding: "plain",
});

// Usage in tests
const currentFiles = [makeFile("new.txt", "sha1")];
const previousFiles = new Map<string, string>();
```

**Mock Data Objects:**
```typescript
// From tests/services/notifier.test.ts
const mockRepository: RepositoryInfo = {
  repository_id: "repo_abc123",
  github_url: "https://github.com/owner/repo",
  owner: "owner",
  name: "repo",
};

const mockFile: ScannedFile = {
  path: "src/index.ts",
  sha: "abc123def456",
  size: 1234,
  content: "const x = 1;",
  isBinary: false,
  contentEncoding: "plain",
};
```

**Location:**
- Defined at top of test file or in `setup.ts`
- Factories are functions returning test data
- Mock objects are constants

## Coverage

**Configuration:** (`vitest.config.ts`)
```typescript
coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    include: ['src/**/*.ts'],
    exclude: ['src/index.ts'] // entry point doesn't need coverage
}
```

**View Coverage:**
```bash
pnpm test -- --coverage
# Generates HTML report in coverage/index.html
```

**Requirements:**
- Entry point (`src/index.ts`) excluded from coverage
- All other modules tested where feasible
- Critical paths have explicit test cases

## Test Types

**Unit Tests:**
- Pure functions with deterministic inputs/outputs
- Example: `tests/utils/signature.test.ts`
- Scope: Single function, all code paths
- Approach: Direct function calls, no mocking unless needed

**Integration Tests:**
- Test components working together
- Example: `tests/services/notifier.test.ts` (mocks axios but tests full payload building)
- Scope: Multiple functions/modules, data flow
- Approach: Mock external dependencies (HTTP, DB) but use real business logic

**API/Route Tests:**
- Test HTTP endpoints end-to-end
- Example: `tests/health.test.ts`
- Scope: Full request/response cycle
- Approach: Use `server.inject()` to simulate requests

**E2E Tests:**
- Not currently used
- Would test complete workflows against real services
- Not in current test suite

## Common Patterns

**Testing Async Functions:**
```typescript
it("should handle async operations", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

**Testing Error Conditions:**
```typescript
it("should return failure with shouldRetry=true for network errors", async () => {
  mockedAxios.post.mockRejectedValueOnce(new Error("Network Error"));

  const result = await sendFileNotification(...);

  expect(result.success).toBe(false);
  expect(result.shouldRetry).toBe(true);
  expect(result.error).toBe("Network Error");
});
```

**Testing State Changes:**
```typescript
it("should detect created files", () => {
  const currentFiles = [makeFile("new.txt", "sha1")];
  const previousFiles = new Map<string, string>();

  const changes = detectChanges(currentFiles, previousFiles);

  expect(changes).toHaveLength(1);
  expect(changes[0].type).toBe("created");
  expect(changes[0].path).toBe("new.txt");
  expect(changes[0].currentFile).toBeDefined();
});
```

**Testing Multiple Scenarios:**
```typescript
describe("multiple scenarios", () => {
  it("should handle case A", () => {
    // Test case A
  });

  it("should handle case B", () => {
    // Test case B
  });
});
```

**Clearing Mocks Between Tests:**
```typescript
beforeEach(() => {
  vi.clearAllMocks();  // Reset all mock state
});
```

## Test Coverage Analysis

**Well-Tested Areas:**
- `src/services/change-detector.ts` - Multiple test cases for each detection type
- `src/utils/signature.ts` - Cryptographic consistency and edge cases
- `src/utils/chunking.ts` - Chunk boundary handling and reconstruction
- `src/services/notifier.ts` - Payload building and HTTP error handling
- Route handlers - Basic HTTP response validation

**Key Test Scenarios:**
- File change detection (create, update, delete)
- HMAC signature generation consistency
- File chunking for large files
- Notification payload structure
- Database mock interactions
- HTTP error status code handling

---

*Testing analysis: 2026-01-26*
