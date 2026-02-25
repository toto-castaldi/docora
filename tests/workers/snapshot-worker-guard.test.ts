import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all dependencies before importing the module under test ---

let capturedProcessor: (job: unknown) => Promise<void>;

vi.mock("bullmq", () => {
  return {
    Worker: class MockWorker {
      constructor(_queue: string, processor: (job: unknown) => Promise<void>) {
        capturedProcessor = processor;
      }
      on() { return this; }
    },
  };
});

vi.mock("../../src/db/index.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/repositories/apps.js", () => ({
  findAppById: vi.fn(),
}));

vi.mock("../../src/services/git.js", () => ({
  cloneOrPull: vi.fn(),
  deleteLocalRepository: vi.fn(),
}));

vi.mock("../../src/services/repo-lock.js", () => ({
  withRepoLock: vi.fn(
    (_repoPath: string, _jobId: string, fn: () => Promise<unknown>) => fn()
  ),
}));

vi.mock("../../src/services/scanner.js", () => ({
  scanRepository: vi.fn(),
}));

vi.mock("../../src/plugins/pipeline.js", () => ({
  defaultPipeline: { execute: vi.fn((files: unknown[]) => files) },
}));

vi.mock("../../src/services/notifier.js", () => ({
  sendFileNotification: vi.fn(),
  buildDeletePayload: vi.fn(),
}));

vi.mock("../../src/services/chunked-notifier.js", () => ({
  sendFileWithChunking: vi.fn(),
}));

vi.mock("../../src/services/failure-notifier.js", () => ({
  sendSyncFailedNotification: vi.fn(),
}));

vi.mock("../../src/repositories/snapshots.js", () => ({
  saveSnapshot: vi.fn(),
}));

vi.mock("../../src/repositories/deliveries.js", () => ({
  getDeliveredFiles: vi.fn(),
  recordDelivery: vi.fn(),
  removeDelivery: vi.fn(),
}));

vi.mock("../../src/repositories/repositories.js", () => ({
  updateAppRepositoryStatus: vi.fn(),
  incrementRetryCount: vi.fn(),
  resetRetryCount: vi.fn(),
  recordGitFailure: vi.fn(),
  resetGitFailures: vi.fn(),
}));

vi.mock("../../src/utils/crypto.js", () => ({
  decryptToken: vi.fn(() => "decrypted-value"),
}));

vi.mock("../../src/queue/connection.js", () => ({
  getRedisUrl: vi.fn(() => "redis://localhost:6379"),
  getRedisOptions: vi.fn(() => ({})),
}));

vi.mock("../../src/services/change-detector.js", () => ({
  detectAndSortChanges: vi.fn(() => []),
  isInitialSnapshot: vi.fn(() => false),
}));

// --- Import after mocks are set up ---

import { findAppById } from "../../src/repositories/apps.js";
import { cloneOrPull } from "../../src/services/git.js";
import { scanRepository } from "../../src/services/scanner.js";
import { sendFileWithChunking } from "../../src/services/chunked-notifier.js";
import { saveSnapshot } from "../../src/repositories/snapshots.js";
import { getDeliveredFiles } from "../../src/repositories/deliveries.js";
import {
  updateAppRepositoryStatus,
  incrementRetryCount,
  resetRetryCount,
  resetGitFailures,
} from "../../src/repositories/repositories.js";

// Import the module and call createSnapshotWorker to capture the processor callback
import { createSnapshotWorker } from "../../src/workers/snapshot.worker.js";
createSnapshotWorker();

const mockedFindAppById = vi.mocked(findAppById);
const mockedCloneOrPull = vi.mocked(cloneOrPull);
const mockedScanRepository = vi.mocked(scanRepository);
const mockedSendFileWithChunking = vi.mocked(sendFileWithChunking);
const mockedSaveSnapshot = vi.mocked(saveSnapshot);
const mockedGetDeliveredFiles = vi.mocked(getDeliveredFiles);
const mockedUpdateAppRepositoryStatus = vi.mocked(updateAppRepositoryStatus);
const mockedIncrementRetryCount = vi.mocked(incrementRetryCount);
const mockedResetRetryCount = vi.mocked(resetRetryCount);
const mockedResetGitFailures = vi.mocked(resetGitFailures);

function createMockJob() {
  return {
    id: "job-123",
    data: {
      app_id: "app_test",
      app_name: "TestApp",
      repository_id: "repo_abc",
      github_url: "https://github.com/owner/repo",
      owner: "owner",
      name: "repo",
      base_url: "https://example.com/webhooks",
      github_token_encrypted: null,
      client_auth_key_encrypted: "encrypted-key",
      isRescan: false,
    },
  };
}

function setupHappyPathMocks(): void {
  mockedCloneOrPull.mockResolvedValue({
    localPath: "/tmp/repos/owner/repo",
    commitSha: "abc123",
    branch: "main",
  });
  mockedResetGitFailures.mockResolvedValue(undefined);
  mockedScanRepository.mockResolvedValue([]);
  mockedGetDeliveredFiles.mockResolvedValue(new Map());
  mockedUpdateAppRepositoryStatus.mockResolvedValue(undefined);
  mockedResetRetryCount.mockResolvedValue(undefined);
  mockedSaveSnapshot.mockResolvedValue(undefined);
}

describe("snapshot worker app-existence guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should abort job cleanly when app is deleted during processing", async () => {
    setupHappyPathMocks();
    mockedFindAppById.mockResolvedValue(undefined);

    const consoleSpy = vi.spyOn(console, "log");

    await capturedProcessor(createMockJob());

    // Notifications should NOT be sent
    expect(mockedSendFileWithChunking).not.toHaveBeenCalled();

    // Snapshot should NOT be saved
    expect(mockedSaveSnapshot).not.toHaveBeenCalled();

    // Status set to "scanning" initially but NOT to "synced"
    expect(mockedUpdateAppRepositoryStatus).toHaveBeenCalledWith(
      "app_test",
      "repo_abc",
      "scanning"
    );
    expect(mockedUpdateAppRepositoryStatus).not.toHaveBeenCalledWith(
      "app_test",
      "repo_abc",
      "synced"
    );

    // Should log the abort message
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("App deleted, aborting job")
    );

    consoleSpy.mockRestore();
  });

  it("should proceed normally when app still exists", async () => {
    setupHappyPathMocks();
    mockedFindAppById.mockResolvedValue({ app_id: "app_test" });

    await capturedProcessor(createMockJob());

    // Snapshot SHOULD be saved (no changes, but snapshot still saved)
    expect(mockedSaveSnapshot).toHaveBeenCalled();

    // Status should reach "synced"
    expect(mockedUpdateAppRepositoryStatus).toHaveBeenCalledWith(
      "app_test",
      "repo_abc",
      "synced"
    );
    expect(mockedResetRetryCount).toHaveBeenCalledWith(
      "app_test",
      "repo_abc"
    );
  });

  it("should not trigger retry when app is deleted", async () => {
    setupHappyPathMocks();
    mockedFindAppById.mockResolvedValue(undefined);

    // Should complete without throwing
    await expect(capturedProcessor(createMockJob())).resolves.toBeUndefined();

    // incrementRetryCount should NOT be called (no error path)
    expect(mockedIncrementRetryCount).not.toHaveBeenCalled();
  });
});
