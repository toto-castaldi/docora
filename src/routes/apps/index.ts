import type { FastifyInstance } from "fastify";
import { onboardRoute } from "./onboard.js";

export async function appsRoutes(server: FastifyInstance): Promise<void> {
  await server.register(onboardRoute);
}
