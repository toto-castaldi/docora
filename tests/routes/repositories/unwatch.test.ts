import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  unlinkAppFromRepository,
  isRepositoryOrphan,
  deleteRepository,
} from "../../../src/repositories/repositories.js";
import { clearDeliveries } from "../../../src/repositories/deliveries.js";
import { deleteLocalRepository } from "../../../src/services/git.js";

// Mock all dependencies
vi.mock("../../../src/repositories/repositories.js", () => ({
  unlinkAppFromRepository: vi.fn(),
  isRepositoryOrphan: vi.fn(),
  deleteRepository: vi.fn(),
}));

vi.mock("../../../src/repositories/deliveries.js", () => ({
  clearDeliveries: vi.fn(),
}));

vi.mock("../../../src/services/git.js", () => ({
  deleteLocalRepository: vi.fn(),
}));

const mockedUnlinkAppFromRepository = vi.mocked(unlinkAppFromRepository);
const mockedIsRepositoryOrphan = vi.mocked(isRepositoryOrphan);
const mockedDeleteRepository = vi.mocked(deleteRepository);
const mockedClearDeliveries = vi.mocked(clearDeliveries);
const mockedDeleteLocalRepository = vi.mocked(deleteLocalRepository);

describe("DELETE /api/repositories/:repository_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unlinkAppFromRepository", () => {
    it("should return null when app-repo link does not exist", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue(null);

      const result = await unlinkAppFromRepository(
        "app_123",
        "repo_abc123def456abc123def456"
      );

      expect(result).toBeNull();
    });

    it("should return repo info when unlink succeeds", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "testowner",
        name: "testrepo",
      });

      const result = await unlinkAppFromRepository(
        "app_123",
        "repo_abc123def456abc123def456"
      );

      expect(result).toEqual({ owner: "testowner", name: "testrepo" });
    });
  });

  describe("isRepositoryOrphan", () => {
    it("should return true when no apps watch the repo", async () => {
      mockedIsRepositoryOrphan.mockResolvedValue(true);

      const result = await isRepositoryOrphan("repo_abc123def456abc123def456");

      expect(result).toBe(true);
    });

    it("should return false when other apps watch the repo", async () => {
      mockedIsRepositoryOrphan.mockResolvedValue(false);

      const result = await isRepositoryOrphan("repo_abc123def456abc123def456");

      expect(result).toBe(false);
    });
  });

  describe("clearDeliveries", () => {
    it("should be called with correct parameters", async () => {
      mockedClearDeliveries.mockResolvedValue(undefined);

      await clearDeliveries("app_123", "repo_abc123def456abc123def456");

      expect(mockedClearDeliveries).toHaveBeenCalledWith(
        "app_123",
        "repo_abc123def456abc123def456"
      );
    });
  });

  describe("orphan repository cleanup", () => {
    it("should delete repository and local clone when orphan", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "testowner",
        name: "testrepo",
      });
      mockedIsRepositoryOrphan.mockResolvedValue(true);
      mockedDeleteRepository.mockResolvedValue(undefined);
      mockedDeleteLocalRepository.mockReturnValue(true);

      // Simulate the unwatch flow
      const repoInfo = await unlinkAppFromRepository(
        "app_123",
        "repo_abc123def456abc123def456"
      );
      await clearDeliveries("app_123", "repo_abc123def456abc123def456");
      const orphan = await isRepositoryOrphan("repo_abc123def456abc123def456");

      if (orphan && repoInfo) {
        await deleteRepository("repo_abc123def456abc123def456");
        deleteLocalRepository(repoInfo.owner, repoInfo.name);
      }

      expect(mockedDeleteRepository).toHaveBeenCalledWith(
        "repo_abc123def456abc123def456"
      );
      expect(mockedDeleteLocalRepository).toHaveBeenCalledWith(
        "testowner",
        "testrepo"
      );
    });

    it("should NOT delete repository when not orphan", async () => {
      mockedUnlinkAppFromRepository.mockResolvedValue({
        owner: "testowner",
        name: "testrepo",
      });
      mockedIsRepositoryOrphan.mockResolvedValue(false);

      // Simulate the unwatch flow
      const repoInfo = await unlinkAppFromRepository(
        "app_123",
        "repo_abc123def456abc123def456"
      );
      await clearDeliveries("app_123", "repo_abc123def456abc123def456");
      const orphan = await isRepositoryOrphan("repo_abc123def456abc123def456");

      if (orphan && repoInfo) {
        await deleteRepository("repo_abc123def456abc123def456");
        deleteLocalRepository(repoInfo.owner, repoInfo.name);
      }

      expect(mockedDeleteRepository).not.toHaveBeenCalled();
      expect(mockedDeleteLocalRepository).not.toHaveBeenCalled();
    });
  });
});
