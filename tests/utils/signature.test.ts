import { describe, it, expect } from "vitest";
import { generateSignedHeaders } from "../../src/utils/signature.js";

describe("signature", () => {
  describe("generateSignedHeaders", () => {
    it("should generate valid headers with all required fields", () => {
      const headers = generateSignedHeaders(
        "app_123",
        { test: "data" },
        "my-secret-key",
        1704700000
      );

      expect(headers["X-Docora-App-Id"]).toBe("app_123");
      expect(headers["X-Docora-Timestamp"]).toBe("1704700000");
      expect(headers["X-Docora-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("should generate consistent signatures for same input", () => {
      const body = { path: "test.txt", content: "hello" };
      const secret = "test-secret";
      const timestamp = 1704700000;

      const headers1 = generateSignedHeaders("app_1", body, secret, timestamp);
      const headers2 = generateSignedHeaders("app_1", body, secret, timestamp);

      expect(headers1["X-Docora-Signature"]).toBe(
        headers2["X-Docora-Signature"]
      );
    });

    it("should generate different signatures for different bodies", () => {
      const secret = "test-secret";
      const timestamp = 1704700000;

      const headers1 = generateSignedHeaders(
        "app_1",
        { a: 1 },
        secret,
        timestamp
      );
      const headers2 = generateSignedHeaders(
        "app_1",
        { a: 2 },
        secret,
        timestamp
      );

      expect(headers1["X-Docora-Signature"]).not.toBe(
        headers2["X-Docora-Signature"]
      );
    });

    it("should generate different signatures for different secrets", () => {
      const body = { test: "data" };
      const timestamp = 1704700000;

      const headers1 = generateSignedHeaders(
        "app_1",
        body,
        "secret-1",
        timestamp
      );
      const headers2 = generateSignedHeaders(
        "app_1",
        body,
        "secret-2",
        timestamp
      );

      expect(headers1["X-Docora-Signature"]).not.toBe(
        headers2["X-Docora-Signature"]
      );
    });

    it("should use current timestamp if not provided", () => {
      const before = Math.floor(Date.now() / 1000);
      const headers = generateSignedHeaders("app_1", {}, "secret");
      const after = Math.floor(Date.now() / 1000);

      const timestamp = parseInt(headers["X-Docora-Timestamp"], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});
