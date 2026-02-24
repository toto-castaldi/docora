import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock redlock module ---

const mockRelease = vi.fn().mockResolvedValue({});
const mockAcquire = vi.fn().mockResolvedValue({ release: mockRelease });
const mockQuit = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();

vi.mock("redlock", () => {
  class ExecutionError extends Error {
    readonly attempts: ReadonlyArray<unknown>;
    constructor(message: string, attempts: ReadonlyArray<unknown> = []) {
      super(message);
      this.name = "ExecutionError";
      this.attempts = attempts;
    }
  }

  class ResourceLockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ResourceLockedError";
    }
  }

  class MockRedlock {
    constructor() {
      // no-op
    }
    acquire = mockAcquire;
    quit = mockQuit;
    on = mockOn;
  }

  return {
    default: MockRedlock,
    ExecutionError,
    ResourceLockedError,
  };
});

vi.mock("../../src/queue/connection.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({}),
}));

// Import AFTER mocks are set up
import {
  withRepoLock,
  LockTimeoutError,
  shutdownRepoLock,
} from "../../src/services/repo-lock.js";
import { ExecutionError } from "redlock";

describe("repo-lock service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquire.mockResolvedValue({ release: mockRelease });
  });

  it("should acquire lock, run callback, and release", async () => {
    const callback = vi.fn().mockResolvedValue("result");

    const result = await withRepoLock("owner/repo", "job-1", callback);

    expect(result).toBe("result");
    expect(mockAcquire).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("should release lock even if callback throws", async () => {
    const error = new Error("callback failure");
    const callback = vi.fn().mockRejectedValue(error);

    await expect(
      withRepoLock("owner/repo", "job-2", callback)
    ).rejects.toThrow("callback failure");

    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("should throw LockTimeoutError when acquire fails", async () => {
    mockAcquire.mockRejectedValue(new ExecutionError("timeout", []));

    await expect(
      withRepoLock("owner/repo", "job-3", vi.fn())
    ).rejects.toThrow(LockTimeoutError);

    await expect(
      withRepoLock("owner/repo", "job-3b", vi.fn())
    ).rejects.toThrow(/Lock timeout acquiring mutex for repo: owner\/repo/);
  });

  it("should use correct lock key format", async () => {
    await withRepoLock("myorg/myrepo", "job-4", async () => "ok");

    expect(mockAcquire).toHaveBeenCalledWith(
      ["docora:repo-lock:myorg/myrepo"],
      expect.any(Number)
    );
  });

  it("LockTimeoutError should have correct name property", () => {
    const error = new LockTimeoutError("owner/repo");

    expect(error.name).toBe("LockTimeoutError");
    expect(error.repoPath).toBe("owner/repo");
  });

  it("LockTimeoutError should not be an UnrecoverableError", () => {
    const error = new LockTimeoutError("owner/repo");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).not.toBe("UnrecoverableError");
    // Must be a plain Error so BullMQ retries
    expect(
      Object.getPrototypeOf(Object.getPrototypeOf(error)).constructor
    ).toBe(Error);
  });
});
