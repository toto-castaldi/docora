import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  shouldChunk,
  createChunks,
  getChunkThreshold,
  getChunkSize,
} from "../../src/utils/chunking.js";

describe("chunking", () => {
  describe("shouldChunk", () => {
    it("should return false for small files", () => {
      const threshold = getChunkThreshold();
      expect(shouldChunk(threshold - 1)).toBe(false);
      expect(shouldChunk(1000)).toBe(false);
    });

    it("should return false for files at exactly threshold", () => {
      const threshold = getChunkThreshold();
      expect(shouldChunk(threshold)).toBe(false);
    });

    it("should return true for files above threshold", () => {
      const threshold = getChunkThreshold();
      expect(shouldChunk(threshold + 1)).toBe(true);
      expect(shouldChunk(threshold * 2)).toBe(true);
    });
  });

  describe("createChunks", () => {
    it("should create single chunk for small content", () => {
      const content = "small content";
      const chunks = createChunks(content);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(content);
      expect(chunks[0].chunk.index).toBe(0);
      expect(chunks[0].chunk.total).toBe(1);
    });

    it("should split content into multiple chunks", () => {
      const chunkSize = getChunkSize();
      // Create content that's 2.5 times the chunk size
      const content = "x".repeat(Math.floor(chunkSize * 2.5));
      const chunks = createChunks(content);

      expect(chunks).toHaveLength(3);

      // Verify indices
      expect(chunks[0].chunk.index).toBe(0);
      expect(chunks[1].chunk.index).toBe(1);
      expect(chunks[2].chunk.index).toBe(2);

      // Verify totals are consistent
      expect(chunks[0].chunk.total).toBe(3);
      expect(chunks[1].chunk.total).toBe(3);
      expect(chunks[2].chunk.total).toBe(3);

      // Verify same ID across all chunks
      expect(chunks[0].chunk.id).toBe(chunks[1].chunk.id);
      expect(chunks[1].chunk.id).toBe(chunks[2].chunk.id);
    });

    it("should generate unique IDs for different calls", () => {
      const content = "test content";
      const chunks1 = createChunks(content);
      const chunks2 = createChunks(content);

      expect(chunks1[0].chunk.id).not.toBe(chunks2[0].chunk.id);
    });

    it("should preserve content when chunks are concatenated", () => {
      const chunkSize = getChunkSize();
      const originalContent = "a".repeat(chunkSize * 3 + 100);
      const chunks = createChunks(originalContent);

      const reconstructed = chunks.map((c) => c.content).join("");
      expect(reconstructed).toBe(originalContent);
    });

    it("should generate valid UUID for chunk id", () => {
      const chunks = createChunks("content");
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(chunks[0].chunk.id).toMatch(uuidRegex);
    });
  });

  describe("getChunkThreshold", () => {
    it("should return default threshold when env not set", () => {
      // Default is 1MB
      expect(getChunkThreshold()).toBe(1048576);
    });
  });

  describe("getChunkSize", () => {
    it("should return default chunk size when env not set", () => {
      // Default is 512KB
      expect(getChunkSize()).toBe(524288);
    });
  });
});
