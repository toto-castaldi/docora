import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDeliveredFiles,
  recordDelivery,
  recordDeliveries,
  removeDelivery,
  clearDeliveries,
} from "../../src/repositories/deliveries.js";

// Mock the database module
vi.mock("../../src/db/index.js", () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from "../../src/db/index.js";
const mockedGetDatabase = vi.mocked(getDatabase);

describe("deliveries repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDeliveredFiles", () => {
    it("should return empty map when no files delivered", async () => {
      const mockExecute = vi.fn().mockResolvedValue([]);
      const mockWhere2 = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockSelect = vi.fn().mockReturnValue({ where: mockWhere1 });
      const mockSelectFrom = vi.fn().mockReturnValue({ select: mockSelect });

      mockedGetDatabase.mockReturnValue({
        selectFrom: mockSelectFrom,
      } as any);

      const result = await getDeliveredFiles("app_123", "repo_456");

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockSelectFrom).toHaveBeenCalledWith("app_delivered_files");
    });

    it("should return map of path -> sha", async () => {
      const mockFiles = [
        { file_path: "src/index.ts", file_sha: "sha1" },
        { file_path: "src/app.ts", file_sha: "sha2" },
      ];
      const mockExecute = vi.fn().mockResolvedValue(mockFiles);
      const mockWhere2 = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockSelect = vi.fn().mockReturnValue({ where: mockWhere1 });
      const mockSelectFrom = vi.fn().mockReturnValue({ select: mockSelect });

      mockedGetDatabase.mockReturnValue({
        selectFrom: mockSelectFrom,
      } as any);

      const result = await getDeliveredFiles("app_123", "repo_456");

      expect(result.get("src/index.ts")).toBe("sha1");
      expect(result.get("src/app.ts")).toBe("sha2");
      expect(result.size).toBe(2);
    });
  });

  describe("recordDelivery", () => {
    it("should insert delivery with upsert", async () => {
      const mockExecute = vi.fn().mockResolvedValue(undefined);
      const mockDoUpdateSet = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockColumns = vi
        .fn()
        .mockReturnValue({ doUpdateSet: mockDoUpdateSet });
      const mockOnConflict = vi.fn((cb) => {
        const oc = { columns: mockColumns };
        cb(oc);
        return { execute: mockExecute };
      });
      const mockValues = vi.fn().mockReturnValue({ onConflict: mockOnConflict });
      const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues });

      mockedGetDatabase.mockReturnValue({
        insertInto: mockInsertInto,
      } as any);

      await recordDelivery("app_123", "repo_456", "src/index.ts", "sha123");

      expect(mockInsertInto).toHaveBeenCalledWith("app_delivered_files");
      expect(mockValues).toHaveBeenCalledWith({
        app_id: "app_123",
        repository_id: "repo_456",
        file_path: "src/index.ts",
        file_sha: "sha123",
      });
    });
  });

  describe("recordDeliveries", () => {
    it("should do nothing for empty array", async () => {
      await recordDeliveries("app_123", "repo_456", []);
      expect(mockedGetDatabase).not.toHaveBeenCalled();
    });

    it("should batch insert deliveries", async () => {
      const mockExecute = vi.fn().mockResolvedValue(undefined);
      const mockDoUpdateSet = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockColumns = vi
        .fn()
        .mockReturnValue({ doUpdateSet: mockDoUpdateSet });
      const mockOnConflict = vi.fn((cb) => {
        const oc = { columns: mockColumns };
        cb(oc);
        return { execute: mockExecute };
      });
      const mockValues = vi.fn().mockReturnValue({ onConflict: mockOnConflict });
      const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues });

      mockedGetDatabase.mockReturnValue({
        insertInto: mockInsertInto,
      } as any);

      await recordDeliveries("app_123", "repo_456", [
        { path: "file1.ts", sha: "sha1" },
        { path: "file2.ts", sha: "sha2" },
      ]);

      expect(mockValues).toHaveBeenCalledWith([
        {
          app_id: "app_123",
          repository_id: "repo_456",
          file_path: "file1.ts",
          file_sha: "sha1",
        },
        {
          app_id: "app_123",
          repository_id: "repo_456",
          file_path: "file2.ts",
          file_sha: "sha2",
        },
      ]);
    });
  });

  describe("removeDelivery", () => {
    it("should delete delivery record", async () => {
      const mockExecute = vi.fn().mockResolvedValue(undefined);
      const mockWhere3 = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockWhere2 = vi.fn().mockReturnValue({ where: mockWhere3 });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockWhere1 });

      mockedGetDatabase.mockReturnValue({
        deleteFrom: mockDeleteFrom,
      } as any);

      await removeDelivery("app_123", "repo_456", "src/deleted.ts");

      expect(mockDeleteFrom).toHaveBeenCalledWith("app_delivered_files");
      expect(mockWhere1).toHaveBeenCalledWith("app_id", "=", "app_123");
      expect(mockWhere2).toHaveBeenCalledWith("repository_id", "=", "repo_456");
      expect(mockWhere3).toHaveBeenCalledWith(
        "file_path",
        "=",
        "src/deleted.ts"
      );
    });
  });

  describe("clearDeliveries", () => {
    it("should delete all deliveries for app-repo pair", async () => {
      const mockExecute = vi.fn().mockResolvedValue(undefined);
      const mockWhere2 = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockWhere1 = vi.fn().mockReturnValue({ where: mockWhere2 });
      const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockWhere1 });

      mockedGetDatabase.mockReturnValue({
        deleteFrom: mockDeleteFrom,
      } as any);

      await clearDeliveries("app_123", "repo_456");

      expect(mockDeleteFrom).toHaveBeenCalledWith("app_delivered_files");
      expect(mockWhere1).toHaveBeenCalledWith("app_id", "=", "app_123");
      expect(mockWhere2).toHaveBeenCalledWith("repository_id", "=", "repo_456");
    });
  });
});
