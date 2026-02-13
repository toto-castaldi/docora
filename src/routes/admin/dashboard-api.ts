import type { FastifyInstance } from "fastify";
import type { ApiErrorResponse } from "@docora/shared-types";
import { appsRoutes } from "./dashboard-api-apps.js";
import { reposRoutes } from "./dashboard-api-repos.js";
import { notificationsRoutes } from "./dashboard-api-notifications.js";
import { queueRoutes } from "./dashboard-api-queue.js";

export async function dashboardApiRoutes(
  server: FastifyInstance
): Promise<void> {
  // Require session auth for all dashboard API routes
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      reply
        .code(401)
        .send({ error: "Unauthorized" } satisfies ApiErrorResponse);
    }
  });

  // Register sub-route plugins
  await server.register(appsRoutes);
  await server.register(reposRoutes);
  await server.register(notificationsRoutes);
  await server.register(queueRoutes);
}
