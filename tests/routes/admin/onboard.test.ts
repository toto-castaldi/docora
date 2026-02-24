import { describe, it, expect, afterAll } from "vitest";
import { getTestServer, closeTestServer } from "../../setup.js";

const VALID_ONBOARD_BODY = {
  base_url: "https://example-app.com/webhooks",
  app_name: "Test App",
  email: "test@example.com",
  client_auth_key: "a-secret-key-at-least-16-chars",
};

afterAll(async () => {
  await closeTestServer();
});

describe("POST /admin/api/apps/onboard", () => {
  it("should return 401 with descriptive message for unauthenticated API request", async () => {
    const server = await getTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/admin/api/apps/onboard",
      payload: VALID_ONBOARD_BODY,
      headers: {
        accept: "application/json",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(
      "Admin authentication required. Use the admin dashboard to onboard new apps."
    );
  });

  it("should return 401 even with accept text/html since URL is an API path", async () => {
    const server = await getTestServer();

    // The URL /admin/api/apps/onboard contains "/admin/api/" so isApiRequest
    // returns true regardless of accept header, which is correct behavior.
    const response = await server.inject({
      method: "POST",
      url: "/admin/api/apps/onboard",
      payload: VALID_ONBOARD_BODY,
      headers: {
        accept: "text/html",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(
      "Admin authentication required. Use the admin dashboard to onboard new apps."
    );
  });

  it("should return 401 for bearer-token-only request (bearer auth is irrelevant)", async () => {
    const server = await getTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/admin/api/apps/onboard",
      payload: VALID_ONBOARD_BODY,
      headers: {
        accept: "application/json",
        authorization: "Bearer some-valid-looking-token",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(
      "Admin authentication required. Use the admin dashboard to onboard new apps."
    );
  });
});

describe("POST /api/apps/onboard (old endpoint)", () => {
  it("should not be accessible - route no longer exists", async () => {
    const server = await getTestServer();

    // The old route is deleted. Without auth, bearer auth plugin returns 401
    // before Fastify checks route existence. This confirms the endpoint
    // is not publicly accessible (no publicAccess: true anymore).
    const response = await server.inject({
      method: "POST",
      url: "/api/apps/onboard",
      payload: VALID_ONBOARD_BODY,
      headers: {
        accept: "application/json",
      },
    });

    // Bearer auth intercepts first, returning 401 for missing auth header.
    // The old public route with publicAccess: true is gone.
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(
      "Missing or invalid Authorization header"
    );
  });
});
