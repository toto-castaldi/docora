import { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.js";
import { versionRoutes } from "./version.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
    await server.register(healthRoutes);
    await server.register(versionRoutes);
}