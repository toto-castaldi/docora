import type { FastifyInstance } from "fastify";
import {
  RepositoryParamsSchema,
  ErrorResponseSchema,
  NoContentSchema,
  type RepositoryParams,
} from "../../schemas/repositories.js";
import { unwatchRepository } from "../../services/repository-management.js";

export async function unwatchRoute(server: FastifyInstance): Promise<void> {
  server.delete<{ Params: RepositoryParams }>(
    "/api/repositories/:repository_id",
    {
      schema: {
        description: "Stop watching a repository",
        security: [{ bearerAuth: [] }],
        params: RepositoryParamsSchema,
        response: {
          204: NoContentSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { repository_id: repositoryId } = request.params;
      const appId = request.appId;

      if (!appId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const result = await unwatchRepository(appId, repositoryId);

      if (!result.success) {
        return reply.status(404).send({
          error: "Repository not found or not registered for this app",
        });
      }

      return reply.status(204).send();
    }
  );
}
