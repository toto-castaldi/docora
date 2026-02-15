import type { FastifyInstance } from "fastify";
import {
  RepositoryParamsSchema,
  ErrorResponseSchema,
  UpdateTokenRequestSchema,
  UpdateTokenResponseSchema,
  type RepositoryParams,
  type UpdateTokenRequest,
} from "../../schemas/repositories.js";
import { validateRepository } from "../../utils/github.js";
import {
  updateGithubToken,
  getRepositoryById,
  isAppLinkedToRepository,
} from "../../repositories/repositories.js";

export async function updateTokenRoute(
  server: FastifyInstance
): Promise<void> {
  server.patch<{ Params: RepositoryParams; Body: UpdateTokenRequest }>(
    "/api/repositories/:repository_id/token",
    {
      schema: {
        description: "Update GitHub token for a watched repository",
        security: [{ bearerAuth: [] }],
        params: RepositoryParamsSchema,
        body: UpdateTokenRequestSchema,
        response: {
          200: UpdateTokenResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          422: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { repository_id: repositoryId } = request.params;
      const appId = request.appId;
      const body = request.body;

      if (!appId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const linked = await isAppLinkedToRepository(appId, repositoryId);
      if (!linked) {
        return reply.status(404).send({
          error: "Repository not found or not registered for this app",
        });
      }

      const repo = await getRepositoryById(repositoryId);
      if (!repo) {
        return reply.status(404).send({ error: "Repository not found" });
      }

      const validation = await validateRepository(
        repo.owner,
        repo.name,
        body.github_token
      );

      if (!validation.valid) {
        return reply.status(422).send({
          error: validation.error ?? "Token cannot access this repository",
        });
      }

      const updated = await updateGithubToken(
        appId,
        repositoryId,
        body.github_token
      );

      if (!updated) {
        return reply
          .status(500)
          .send({ error: "Failed to update token" });
      }

      return reply
        .status(200)
        .send({ message: "Token updated successfully" });
    }
  );
}
