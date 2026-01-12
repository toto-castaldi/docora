import type { FastifyInstance } from "fastify";
import {
  RepositoryParamsSchema,
  ErrorResponseSchema,
  NoContentSchema,
  type RepositoryParams,
} from "../../schemas/repositories.js";
import {
  unlinkAppFromRepository,
  isRepositoryOrphan,
  deleteRepository,
} from "../../repositories/repositories.js";
import { clearDeliveries } from "../../repositories/deliveries.js";
import { deleteLocalRepository } from "../../services/git.js";

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

      // Unlink app from repository (returns repo info if existed)
      const repoInfo = await unlinkAppFromRepository(appId, repositoryId);

      if (!repoInfo) {
        return reply.status(404).send({
          error: "Repository not found or not registered for this app",
        });
      }

      // Clear delivery records for this app-repository pair
      await clearDeliveries(appId, repositoryId);

      // Check if repository is now orphan (no other apps watching)
      const orphan = await isRepositoryOrphan(repositoryId);

      if (orphan) {
        // Delete repository from database
        await deleteRepository(repositoryId);

        // Delete local clone
        deleteLocalRepository(repoInfo.owner, repoInfo.name);
      }

      return reply.status(204).send();
    }
  );
}
