import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

let server: FastifyInstance;

beforeAll(async () => {
  // Set session secret before building server so admin auth is available
  process.env.ADMIN_SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

  // Dynamic import to pick up the env var
  const { buildServer } = await import("../../../src/server.js");
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  if (server) {
    await server.close();
  }
  delete process.env.ADMIN_SESSION_SECRET;
});

describe("DELETE /admin/api/apps/:appId", () => {
  it("should return 401 for unauthenticated request", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/admin/api/apps/test-id",
      headers: {
        accept: "application/json",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("Not authenticated");
  });

  it("should return 401 for request without session cookie", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/admin/api/apps/app_123",
    });

    // The URL contains /admin/api/ so isApiRequest returns true
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("Not authenticated");
  });

  it("should return 401 for invalid session cookie", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/admin/api/apps/nonexistent",
      cookies: {
        sessionId: "invalid-session-id",
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
