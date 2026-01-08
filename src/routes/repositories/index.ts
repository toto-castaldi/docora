import type { FastifyInstance } from "fastify";
import { registerRoute } from "./register.js";

export async function repositoriesRoutes(
  server: FastifyInstance
): Promise<void> {
  await server.register(registerRoute);
}
