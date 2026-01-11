import { describe, it, expect } from "vitest";
import { isBinaryBuffer } from "../../src/utils/binary.js";

describe("binary", () => {
  describe("isBinaryBuffer", () => {
    it("should detect text content as non-binary", async () => {
      const textBuffer = Buffer.from("Hello, world! This is plain text.");
      const result = await isBinaryBuffer(textBuffer);
      expect(result).toBe(false);
    });

    it("should detect UTF-8 text with special chars as non-binary", async () => {
      const utf8Buffer = Buffer.from("Héllo wörld! 你好世界 🎉");
      const result = await isBinaryBuffer(utf8Buffer);
      expect(result).toBe(false);
    });

    it("should detect JSON as non-binary", async () => {
      const jsonBuffer = Buffer.from('{"key": "value", "number": 123}');
      const result = await isBinaryBuffer(jsonBuffer);
      expect(result).toBe(false);
    });

    it("should detect buffer with null bytes as binary", async () => {
      const binaryBuffer = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]);
      const result = await isBinaryBuffer(binaryBuffer);
      expect(result).toBe(true);
    });

    it("should detect PNG header as binary", async () => {
      // PNG magic bytes
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const result = await isBinaryBuffer(pngBuffer);
      expect(result).toBe(true);
    });

    it("should detect JPEG header as binary", async () => {
      // JPEG magic bytes
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const result = await isBinaryBuffer(jpegBuffer);
      expect(result).toBe(true);
    });

    it("should handle empty buffer", async () => {
      const emptyBuffer = Buffer.from([]);
      const result = await isBinaryBuffer(emptyBuffer);
      expect(result).toBe(false);
    });
  });
});
