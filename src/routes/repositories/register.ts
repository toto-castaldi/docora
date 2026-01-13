import type { FastifyInstance } from "fastify";
import {
  RegisterRepositoryRequestSchema,
  RegisterRepositoryResponseSchema,
  ErrorResponseSchema,
  type RegisterRepositoryRequest,
} from "../../schemas/repositories.js";
import { parseGitHubUrl, validateRepository } from "../../utils/github.js";
import {
  findOrCreateRepository,
  isAppLinkedToRepository,
  linkAppToRepository,
  getRepositoryById,
} from "../../repositories/repositories.js";
import { unwatchRepository } from "../../services/repository-management.js";

export async function registerRoute(server: FastifyInstance): Promise<void> {
  server.post(
    "/api/repositories",
    {
      schema: {
        security : [{ bearerAuth : []}],
        body: RegisterRepositoryRequestSchema,
        response: {
          201: RegisterRepositoryResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          422: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as RegisterRepositoryRequest;
      const appId = request.appId;

      // appId should always be present (auth middleware ensures this)
      if (!appId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Parse GitHub URL
      const parsed = parseGitHubUrl(body.github_url);
      if (!parsed) {
        return reply.status(422).send({ error: "Invalid GitHub URL format" });
      }

      // Validate repository exists on GitHub
      const validation = await validateRepository(
        parsed.owner,
        parsed.name,
        body.github_token
      );

      if (!validation.valid) {
        return reply
          .status(404)
          .send({ error: validation.error ?? "Repository not found" });
      }

      // Find or create the repository
      const { repositoryId } = await findOrCreateRepository({
        githubUrl: body.github_url,
        owner: parsed.owner,
        name: parsed.name,
        isPrivate: validation.isPrivate ?? false,
      });

      // If app already linked, unwatch first (re-registration = unwatch + register)
      const alreadyLinked = await isAppLinkedToRepository(appId, repositoryId);
      if (alreadyLinked) {
        await unwatchRepository(appId, repositoryId);
      }

      // Link app to repository
      await linkAppToRepository({
        appId,
        repositoryId,
        githubToken: body.github_token,
      });

      // Get the repository data for response
      const repo = await getRepositoryById(repositoryId);
      if (!repo) {
        return reply
          .status(500)
          .send({ error: "Failed to retrieve repository" });
      }

      return reply.status(201).send({
        repository_id: repo.repository_id,
        github_url: repo.github_url,
        owner: repo.owner,
        name: repo.name,
        is_private: repo.is_private,
        created_at: repo.created_at.toISOString(),
      });
    }
  );
}
