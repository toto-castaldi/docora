import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  sendFileNotification,
  buildCreatePayload,
  buildUpdatePayload,
  buildDeletePayload,
  type RepositoryInfo,
} from "../../src/services/notifier.js";
import type { ScannedFile } from "../../src/services/scanner.js";

// Mock axios
vi.mock("axios");
const mockedAxios = vi.mocked(axios);

// Mock signature utility
vi.mock("../../src/utils/signature.js", () => ({
  generateSignedHeaders: vi.fn(() => ({
    "X-Docora-App-Id": "app_test123",
    "X-Docora-Signature": "sha256=mockedsignature",
    "X-Docora-Timestamp": "1704700000",
  })),
}));

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

describe("notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendFileNotification", () => {
    it("should send POST request to correct endpoint", async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const payload = buildCreatePayload(mockRepository, mockFile, "commit123");

      await sendFileNotification(
        "https://app.example.com/webhook",
        "create",
        payload,
        "app_test123",
        "secret-key"
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://app.example.com/webhook/create",
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Docora-App-Id": "app_test123",
            "X-Docora-Signature": "sha256=mockedsignature",
            "X-Docora-Timestamp": "1704700000",
          }),
        })
      );
    });

    it("should return success for 2xx responses", async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 201 });

      const payload = buildCreatePayload(mockRepository, mockFile, "commit123");
      const result = await sendFileNotification(
        "https://app.example.com/webhook",
        "create",
        payload,
        "app_test123",
        "secret-key"
      );

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(false);
    });

    it("should return failure with shouldRetry=true for any non-2xx response", async () => {
      // Test 4xx - now retries (unified error handling)
      mockedAxios.post.mockResolvedValueOnce({ status: 400 });

      const payload = buildCreatePayload(mockRepository, mockFile, "commit123");
      let result = await sendFileNotification(
        "https://app.example.com/webhook",
        "create",
        payload,
        "app_test123",
        "secret-key"
      );

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.statusCode).toBe(400);

      // Test 5xx - also retries
      mockedAxios.post.mockResolvedValueOnce({ status: 500 });

      result = await sendFileNotification(
        "https://app.example.com/webhook",
        "create",
        payload,
        "app_test123",
        "secret-key"
      );

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.statusCode).toBe(500);
    });

    it("should return failure with shouldRetry=true for network errors", async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error("Network Error"));

      const payload = buildCreatePayload(mockRepository, mockFile, "commit123");
      const result = await sendFileNotification(
        "https://app.example.com/webhook",
        "create",
        payload,
        "app_test123",
        "secret-key"
      );

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toBe("Network Error");
    });

    it("should call correct endpoint for each notification type", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const createPayload = buildCreatePayload(
        mockRepository,
        mockFile,
        "commit123"
      );
      const updatePayload = buildUpdatePayload(
        mockRepository,
        mockFile,
        "oldsha",
        "commit123"
      );
      const deletePayload = buildDeletePayload(
        mockRepository,
        "deleted.txt",
        "oldsha",
        "commit123"
      );

      await sendFileNotification(
        "https://app.com",
        "create",
        createPayload,
        "app1",
        "key"
      );
      await sendFileNotification(
        "https://app.com",
        "update",
        updatePayload,
        "app1",
        "key"
      );
      await sendFileNotification(
        "https://app.com",
        "delete",
        deletePayload,
        "app1",
        "key"
      );

      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        "https://app.com/create",
        expect.anything(),
        expect.anything()
      );
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        "https://app.com/update",
        expect.anything(),
        expect.anything()
      );
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        3,
        "https://app.com/delete",
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe("buildCreatePayload", () => {
    it("should build correct payload structure", () => {
      const payload = buildCreatePayload(mockRepository, mockFile, "commit123");

      expect(payload.repository).toEqual(mockRepository);
      expect(payload.file.path).toBe("src/index.ts");
      expect(payload.file.sha).toBe("abc123def456");
      expect(payload.file.size).toBe(1234);
      expect(payload.file.content).toBe("const x = 1;");
      expect(payload.commit_sha).toBe("commit123");
      expect(payload.timestamp).toBeDefined();
      expect(payload.previous_sha).toBeUndefined();
    });
  });

  describe("buildUpdatePayload", () => {
    it("should include previous_sha", () => {
      const payload = buildUpdatePayload(
        mockRepository,
        mockFile,
        "oldsha123",
        "commit123"
      );

      expect(payload.file.sha).toBe("abc123def456");
      expect(payload.previous_sha).toBe("oldsha123");
      expect(payload.commit_sha).toBe("commit123");
    });
  });

  describe("buildDeletePayload", () => {
    it("should build payload without content/size", () => {
      const payload = buildDeletePayload(
        mockRepository,
        "deleted.txt",
        "sha123",
        "commit123"
      );

      expect(payload.file.path).toBe("deleted.txt");
      expect(payload.file.sha).toBe("sha123");
      expect(payload.file.size).toBeUndefined();
      expect(payload.file.content).toBeUndefined();
      expect(payload.commit_sha).toBe("commit123");
    });
  });
});
