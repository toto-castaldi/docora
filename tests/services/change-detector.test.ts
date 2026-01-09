import { describe, it, expect } from "vitest";
import {
  detectChanges,
  sortChanges,
  detectAndSortChanges,
  isInitialSnapshot,
  groupChangesByType,
} from "../../src/services/change-detector.js";
import type { ScannedFile } from "../../src/services/scanner.js";

const makeFile = (path: string, sha: string): ScannedFile => ({
  path,
  sha,
  size: 100,
  content: "test content",
});

describe("change-detector", () => {
  describe("detectChanges", () => {
    it("should detect created files", () => {
      const currentFiles = [makeFile("new.txt", "sha1")];
      const previousFiles = new Map<string, string>();

      const changes = detectChanges(currentFiles, previousFiles);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("created");
      expect(changes[0].path).toBe("new.txt");
      expect(changes[0].currentFile).toBeDefined();
    });

    it("should detect deleted files", () => {
      const currentFiles: ScannedFile[] = [];
      const previousFiles = new Map([["old.txt", "sha1"]]);

      const changes = detectChanges(currentFiles, previousFiles);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("deleted");
      expect(changes[0].path).toBe("old.txt");
      expect(changes[0].previousSha).toBe("sha1");
    });

    it("should detect updated files", () => {
      const currentFiles = [makeFile("file.txt", "sha-new")];
      const previousFiles = new Map([["file.txt", "sha-old"]]);

      const changes = detectChanges(currentFiles, previousFiles);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("updated");
      expect(changes[0].path).toBe("file.txt");
      expect(changes[0].currentFile?.sha).toBe("sha-new");
      expect(changes[0].previousSha).toBe("sha-old");
    });

    it("should ignore unchanged files", () => {
      const currentFiles = [makeFile("same.txt", "sha1")];
      const previousFiles = new Map([["same.txt", "sha1"]]);

      const changes = detectChanges(currentFiles, previousFiles);

      expect(changes).toHaveLength(0);
    });

    it("should detect multiple change types", () => {
      const currentFiles = [
        makeFile("new.txt", "sha-new"),
        makeFile("modified.txt", "sha-modified-new"),
        makeFile("unchanged.txt", "sha-same"),
      ];
      const previousFiles = new Map([
        ["deleted.txt", "sha-deleted"],
        ["modified.txt", "sha-modified-old"],
        ["unchanged.txt", "sha-same"],
      ]);

      const changes = detectChanges(currentFiles, previousFiles);

      expect(changes).toHaveLength(3);
      expect(changes.map((c) => c.type).sort()).toEqual([
        "created",
        "deleted",
        "updated",
      ]);
    });
  });

  describe("sortChanges", () => {
    it("should sort: deleted → created → updated", () => {
      const changes = [
        {
          type: "updated" as const,
          path: "u.txt",
          currentFile: makeFile("u.txt", "sha"),
          previousSha: "old",
        },
        {
          type: "created" as const,
          path: "c.txt",
          currentFile: makeFile("c.txt", "sha"),
        },
        { type: "deleted" as const, path: "d.txt", previousSha: "sha" },
      ];

      const sorted = sortChanges(changes);

      expect(sorted[0].type).toBe("deleted");
      expect(sorted[1].type).toBe("created");
      expect(sorted[2].type).toBe("updated");
    });
  });

  describe("isInitialSnapshot", () => {
    it("should return true for empty previous files", () => {
      expect(isInitialSnapshot(new Map())).toBe(true);
    });

    it("should return false when previous files exist", () => {
      expect(isInitialSnapshot(new Map([["file.txt", "sha"]]))).toBe(false);
    });
  });

  describe("groupChangesByType", () => {
    it("should group changes correctly", () => {
      const changes = [
        {
          type: "created" as const,
          path: "c1.txt",
          currentFile: makeFile("c1.txt", "sha"),
        },
        {
          type: "created" as const,
          path: "c2.txt",
          currentFile: makeFile("c2.txt", "sha"),
        },
        { type: "deleted" as const, path: "d1.txt", previousSha: "sha" },
        {
          type: "updated" as const,
          path: "u1.txt",
          currentFile: makeFile("u1.txt", "sha"),
          previousSha: "old",
        },
      ];

      const grouped = groupChangesByType(changes);

      expect(grouped.created).toHaveLength(2);
      expect(grouped.deleted).toHaveLength(1);
      expect(grouped.updated).toHaveLength(1);
    });
  });
});
