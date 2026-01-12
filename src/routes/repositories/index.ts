import type { FastifyInstance } from "fastify";
import { registerRoute } from "./register.js";
import { unwatchRoute } from "./unwatch.js";

export async function repositoriesRoutes(
  server: FastifyInstance
): Promise<void> {
  await server.register(registerRoute);
  await server.register(unwatchRoute);
}
