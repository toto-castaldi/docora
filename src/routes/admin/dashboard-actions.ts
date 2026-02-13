import type { FastifyInstance } from "fastify";
import { retrySingle, resyncSingle, resyncByApp } from "../../services/admin-actions.js";
import type {
  RetryRequest,
  RetryResponse,
  ResyncRequest,
  BulkRetryResponse,
  ApiResponse,
  ApiErrorResponse,
} from "@docora/shared-types";

export async function dashboardActionRoutes(
  server: FastifyInstance
): Promise<void> {
  // Require session auth for all action routes
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      reply
        .code(401)
        .send({ error: "Unauthorized" } satisfies ApiErrorResponse);
    }
  });

  // POST /admin/api/retry - Retry a single failed app-repository pair
  server.post<{
    Body: RetryRequest;
    Reply: ApiResponse<RetryResponse> | ApiErrorResponse;
  }>("/admin/api/retry", async (request, reply) => {
    const { app_id, repository_id } = request.body ?? {};

    if (!app_id || !repository_id) {
      return reply
        .code(400)
        .send({ error: "app_id and repository_id are required" });
    }

    try {
      const { jobId } = await retrySingle(app_id, repository_id);
      return reply.send({
        data: { message: "Retry queued", job_id: jobId },
      });
    } catch (error) {
      const message = (error as Error).message;

      if (message === "App-repository link not found") {
        return reply.code(404).send({ error: message });
      }

      if (message === "Only failed entries can be retried") {
        return reply.code(409).send({ error: message });
      }

      console.error("Error queuing retry:", error);
      return reply.code(500).send({ error: "Failed to queue retry" });
    }
  });

  // POST /admin/api/resync - Re-sync a single app-repository pair
  server.post<{
    Body: ResyncRequest;
    Reply: ApiResponse<RetryResponse> | ApiErrorResponse;
  }>("/admin/api/resync", async (request, reply) => {
    const { app_id, repository_id } = request.body ?? {};

    if (!app_id || !repository_id) {
      return reply
        .code(400)
        .send({ error: "app_id and repository_id are required" });
    }

    try {
      const { jobId } = await resyncSingle(app_id, repository_id);
      return reply.send({
        data: { message: "Re-sync queued", job_id: jobId },
      });
    } catch (error) {
      const message = (error as Error).message;

      if (message === "App-repository link not found") {
        return reply.code(404).send({ error: message });
      }

      console.error("Error queuing re-sync:", error);
      return reply.code(500).send({ error: "Failed to queue re-sync" });
    }
  });

  // POST /admin/api/resync/app/:appId - Re-sync all repos for an app
  server.post<{
    Params: { appId: string };
    Reply: ApiResponse<BulkRetryResponse> | ApiErrorResponse;
  }>("/admin/api/resync/app/:appId", async (request, reply) => {
    try {
      const { operationId, total } = await resyncByApp(request.params.appId);
      return reply.send({
        data: {
          message: "Bulk re-sync started",
          operation_id: operationId,
          total,
        },
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === "No repositories for this app") {
        return reply.code(404).send({ error: message });
      }
      console.error("Error starting bulk re-sync:", error);
      return reply.code(500).send({ error: "Failed to start bulk re-sync" });
    }
  });
}
