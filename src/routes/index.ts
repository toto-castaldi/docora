import { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.js";
import { versionRoutes } from "./version.js";
import { appsRoutes } from "./apps/index.js";
import { repositoriesRoutes } from "./repositories/index.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(healthRoutes);
  await server.register(versionRoutes);
  await server.register(appsRoutes);
  await server.register(repositoriesRoutes);
}
