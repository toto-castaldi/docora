import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { adminOnboardRoute } from "./onboard.js";
import { dashboardApiRoutes } from "./dashboard-api.js";
import { dashboardActionRoutes } from "./dashboard-actions.js";
import { dashboardBulkActionRoutes } from "./dashboard-bulk-actions.js";
import { staticRoutes } from "./static.js";

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  // Auth routes must be registered BEFORE static routes
  // to prevent SPA catch-all from intercepting API requests
  await server.register(authRoutes);
  await server.register(adminOnboardRoute);
  await server.register(dashboardApiRoutes);
  await server.register(dashboardActionRoutes);
  await server.register(dashboardBulkActionRoutes);
  await server.register(staticRoutes);
}
