import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findRepositoriesByAppId,
  isRepositoryOrphan,
  deleteRepository,
} from "../../src/repositories/repositories.js";
import { deleteLocalRepository } from "../../src/services/git.js";

// --- Mock chain builders for Kysely ---

function buildSelectChain(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        executeTakeFirst: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function buildDeleteChain() {
  return {
    where: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

let selectResult: unknown = undefined;

vi.mock("../../src/db/index.js", () => ({
  getDatabase: vi.fn(() => ({
    selectFrom: vi.fn(() => buildSelectChain(selectResult)),
    transaction: vi.fn(() => ({
      execute: vi.fn(async (callback: (trx: unknown) => Promise<void>) => {
        const trx = {
          deleteFrom: vi.fn(() => buildDeleteChain()),
        };
        await callback(trx);
      }),
    })),
  })),
}));

vi.mock("../../src/repositories/repositories.js", () => ({
  findRepositoriesByAppId: vi.fn(),
  isRepositoryOrphan: vi.fn(),
  deleteRepository: vi.fn(),
}));

vi.mock("../../src/services/git.js", () => ({
  deleteLocalRepository: vi.fn(),
}));

vi.mock("../../src/services/repo-lock.js", () => ({
  withRepoLock: vi.fn(
    (_repoPath: string, _jobId: string, fn: () => Promise<unknown>) => fn()
  ),
}));

vi.mock("../../src/queue/connection.js", () => ({
  getRedisUrl: vi.fn(() => "redis://localhost:6379"),
  getRedisOptions: vi.fn(() => ({ maxRetriesPerRequest: null })),
}));

const mockJobRemove = vi.fn();
const mockJobGetState = vi.fn();
const mockGetJob = vi.fn();

vi.mock("bullmq", () => {
  return {
    Queue: class MockQueue {
      constructor() {
        // no-op
      }
      getJob(...args: unknown[]) { return mockGetJob(...args); }
      close() { return Promise.resolve(); }
    },
  };
});

const mockedFindRepositoriesByAppId = vi.mocked(findRepositoriesByAppId);
const mockedIsRepositoryOrphan = vi.mocked(isRepositoryOrphan);
const mockedDeleteRepository = vi.mocked(deleteRepository);
const mockedDeleteLocalRepository = vi.mocked(deleteLocalRepository);

const MOCK_REPO = {
  repository_id: "repo_1",
  github_url: "https://github.com/owner/repo",
  owner: "owner",
  name: "repo",
  is_private: false,
  created_at: new Date(),
};

describe("app-deletion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob.mockReset();
    mockJobRemove.mockReset();
    mockJobGetState.mockReset();
    selectResult = undefined;
  });

  describe("deleteApp", () => {
    it("should return deleted:false when app does not exist", async () => {
      selectResult = undefined;
      // Dynamic import after mocks are set up
      const { deleteApp } = await import("../../src/services/app-deletion.js");

      const result = await deleteApp("app_nonexistent");

      expect(result).toEqual({
        deleted: false,
        repositories_unlinked: 0,
        orphaned_repositories_cleaned: 0,
      });
      expect(mockedFindRepositoriesByAppId).not.toHaveBeenCalled();
    });

    it("should delete app with cascade in correct FK order", async () => {
      selectResult = { app_id: "app_123" };
      const { deleteApp } = await import("../../src/services/app-deletion.js");

      mockedFindRepositoriesByAppId.mockResolvedValue([MOCK_REPO]);
      mockedIsRepositoryOrphan.mockResolvedValue(false);
      mockGetJob.mockResolvedValue(null);

      const result = await deleteApp("app_123");

      expect(result).toEqual({
        deleted: true,
        repositories_unlinked: 1,
        orphaned_repositories_cleaned: 0,
      });
      expect(mockedDeleteRepository).not.toHaveBeenCalled();
      expect(mockedDeleteLocalRepository).not.toHaveBeenCalled();
    });

    it("should clean up orphaned repository and local clone", async () => {
      selectResult = { app_id: "app_123" };
      const { deleteApp } = await import("../../src/services/app-deletion.js");

      const orphanRepo = {
        ...MOCK_REPO,
        repository_id: "repo_orphan",
        owner: "testowner",
        name: "testrepo",
      };
      mockedFindRepositoriesByAppId.mockResolvedValue([orphanRepo]);
      mockedIsRepositoryOrphan.mockResolvedValue(true);
      mockedDeleteRepository.mockResolvedValue(undefined);
      mockedDeleteLocalRepository.mockReturnValue(true);
      mockGetJob.mockResolvedValue(null);

      const result = await deleteApp("app_123");

      expect(result.orphaned_repositories_cleaned).toBe(1);
      expect(mockedDeleteRepository).toHaveBeenCalledWith("repo_orphan");
      expect(mockedDeleteLocalRepository).toHaveBeenCalledWith("testowner", "testrepo");
    });

    it("should log and continue when disk cleanup fails", async () => {
      selectResult = { app_id: "app_123" };
      const { deleteApp } = await import("../../src/services/app-deletion.js");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const failRepo = {
        ...MOCK_REPO,
        repository_id: "repo_fail",
        owner: "failowner",
        name: "failrepo",
      };
      mockedFindRepositoriesByAppId.mockResolvedValue([failRepo]);
      mockedIsRepositoryOrphan.mockResolvedValue(true);
      mockedDeleteRepository.mockResolvedValue(undefined);
      mockGetJob.mockResolvedValue(null);

      // Override withRepoLock to throw
      const repoLock = await import("../../src/services/repo-lock.js");
      vi.mocked(repoLock.withRepoLock).mockRejectedValueOnce(new Error("disk error"));

      const result = await deleteApp("app_123");

      // DB cleanup succeeded (count is 1), disk cleanup failed but was caught
      expect(result.orphaned_repositories_cleaned).toBe(1);
      expect(mockedDeleteRepository).toHaveBeenCalledWith("repo_fail");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should remove pending BullMQ jobs", async () => {
      selectResult = { app_id: "app_123" };
      const { deleteApp } = await import("../../src/services/app-deletion.js");

      const jobRepo = { ...MOCK_REPO, repository_id: "repo_job" };
      mockedFindRepositoriesByAppId.mockResolvedValue([jobRepo]);
      mockedIsRepositoryOrphan.mockResolvedValue(false);

      mockJobGetState.mockResolvedValue("waiting");
      mockGetJob.mockResolvedValue({
        getState: mockJobGetState,
        remove: mockJobRemove,
      });
      mockJobRemove.mockResolvedValue(undefined);

      const result = await deleteApp("app_123");

      expect(result.deleted).toBe(true);
      expect(mockGetJob).toHaveBeenCalledWith("app_123-repo_job");
      expect(mockJobRemove).toHaveBeenCalled();
    });
  });
});
