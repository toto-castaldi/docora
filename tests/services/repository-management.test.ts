import { describe, it, expect, vi, beforeEach } from "vitest";
import { unwatchRepository } from "../../src/services/repository-management.js";
import {
  unlinkAppFromRepository,
  isRepositoryOrphan,
  deleteRepository,
} from "../../src/repositories/repositories.js";
import { clearDeliveries } from "../../src/repositories/deliveries.js";
import { deleteLocalRepository } from "../../src/services/git.js";

// Mock all dependencies
vi.mock("../../src/repositories/repositories.js", () => ({
  unlinkAppFromRepository: vi.fn(),
  isRepositoryOrphan: vi.fn(),
  deleteRepository: vi.fn(),
}));

vi.mock("../../src/repositories/deliveries.js", () => ({
  clearDeliveries: vi.fn(),
}));

vi.mock("../../src/services/git.js", () => ({
  deleteLocalRepository: vi.fn(),
}));

vi.mock("../../src/services/repo-lock.js", () => ({
  withRepoLock: vi.fn((_repoPath: string, _jobId: string, fn: () => Promise<unknown>) => fn()),
}));

const mockedUnlinkAppFromRepository = vi.mocked(unlinkAppFromRepository);
const mockedIsRepositoryOrphan = vi.mocked(isRepositoryOrphan);
const mockedDeleteRepository = vi.mocked(deleteRepository);
const mockedClearDeliveries = vi.mocked(clearDeliveries);
const mockedDeleteLocalRepository = vi.mocked(deleteLocalRepository);

describe("repository-management service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unwatchRepository", () => {
    it("should return success=false when app-repo link does not exist", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue(null);

      const result = await unwatchRepository("app_123", "repo_456");

      expect(result).toEqual({ success: false, wasOrphan: false });
      expect(mockedClearDeliveries).not.toHaveBeenCalled();
      expect(mockedIsRepositoryOrphan).not.toHaveBeenCalled();
    });

    it("should unlink, clear deliveries, and check orphan status", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "testowner",
        name: "testrepo",
      });
      mockedClearDeliveries.mockResolvedValue(undefined);
      mockedIsRepositoryOrphan.mockResolvedValue(false);

      const result = await unwatchRepository("app_123", "repo_456");

      expect(result).toEqual({ success: true, wasOrphan: false });
      expect(mockedUnlinkAppFromRepository).toHaveBeenCalledWith("app_123", "repo_456");
      expect(mockedClearDeliveries).toHaveBeenCalledWith("app_123", "repo_456");
      expect(mockedIsRepositoryOrphan).toHaveBeenCalledWith("repo_456");
      expect(mockedDeleteRepository).not.toHaveBeenCalled();
      expect(mockedDeleteLocalRepository).not.toHaveBeenCalled();
    });

    it("should delete repository and local clone when orphan", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "testowner",
        name: "testrepo",
      });
      mockedClearDeliveries.mockResolvedValue(undefined);
      mockedIsRepositoryOrphan.mockResolvedValue(true);
      mockedDeleteRepository.mockResolvedValue(undefined);
      mockedDeleteLocalRepository.mockReturnValue(true);

      const result = await unwatchRepository("app_123", "repo_456");

      expect(result).toEqual({ success: true, wasOrphan: true });
      expect(mockedDeleteRepository).toHaveBeenCalledWith("repo_456");
      expect(mockedDeleteLocalRepository).toHaveBeenCalledWith("testowner", "testrepo");
    });

    it("should be usable for re-registration flow (unwatch before register)", async () => {
      // Simulate: app already registered, wants to re-register
      // Step 1: unwatch existing
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "myorg",
        name: "myrepo",
      });
      mockedClearDeliveries.mockResolvedValue(undefined);
      mockedIsRepositoryOrphan.mockResolvedValue(false); // Other apps may watch

      const unwatchResult = await unwatchRepository("app_reregister", "repo_xyz");

      expect(unwatchResult.success).toBe(true);
      expect(mockedClearDeliveries).toHaveBeenCalledWith("app_reregister", "repo_xyz");

      // After this, the app can call linkAppToRepository again
      // The delivery records are cleared, so the app gets a fresh initial snapshot
    });

    it("should handle re-registration when app is the only watcher (orphan cleanup)", async () => {
      // Edge case: app re-registers and is the only watcher
      // This means the repo becomes orphan temporarily, then re-created
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "soleowner",
        name: "solerepo",
      });
      mockedClearDeliveries.mockResolvedValue(undefined);
      mockedIsRepositoryOrphan.mockResolvedValue(true);
      mockedDeleteRepository.mockResolvedValue(undefined);
      mockedDeleteLocalRepository.mockReturnValue(true);

      const result = await unwatchRepository("app_sole", "repo_sole");

      expect(result).toEqual({ success: true, wasOrphan: true });
      // Repository is deleted, will be re-created on register
      expect(mockedDeleteRepository).toHaveBeenCalledWith("repo_sole");
      expect(mockedDeleteLocalRepository).toHaveBeenCalledWith("soleowner", "solerepo");
    });
  });
});
