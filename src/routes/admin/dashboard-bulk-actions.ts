import type { FastifyInstance } from "fastify";
import { retryByApp, retryAll } from "../../services/admin-actions.js";
import {
  getProgress,
  cancelProgress,
} from "../../services/bulk-progress.js";
import type {
  BulkRetryResponse,
  BulkProgressResponse,
  ApiResponse,
  ApiErrorResponse,
} from "@docora/shared-types";

export async function dashboardBulkActionRoutes(
  server: FastifyInstance
): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      reply
        .code(401)
        .send({ error: "Unauthorized" } satisfies ApiErrorResponse);
    }
  });

  // POST /admin/api/retry/app/:appId - Retry all failed for an app
  server.post<{
    Params: { appId: string };
    Reply: ApiResponse<BulkRetryResponse> | ApiErrorResponse;
  }>("/admin/api/retry/app/:appId", async (request, reply) => {
    try {
      const { operationId, total } = await retryByApp(request.params.appId);
      return reply.send({
        data: {
          message: "Bulk retry started",
          operation_id: operationId,
          total,
        },
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === "No failed notifications for this app") {
        return reply.code(404).send({ error: message });
      }
      console.error("Error starting bulk retry:", error);
      return reply.code(500).send({ error: "Failed to start bulk retry" });
    }
  });

  // POST /admin/api/retry/all - Retry all failed across all apps
  server.post<{
    Reply: ApiResponse<BulkRetryResponse> | ApiErrorResponse;
  }>("/admin/api/retry/all", async (_request, reply) => {
    try {
      const { operationId, total } = await retryAll();
      return reply.send({
        data: {
          message: "Bulk retry started",
          operation_id: operationId,
          total,
        },
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === "No failed notifications found") {
        return reply.code(404).send({ error: message });
      }
      console.error("Error starting bulk retry:", error);
      return reply.code(500).send({ error: "Failed to start bulk retry" });
    }
  });

  // GET /admin/api/retry/progress/:operationId - Poll progress
  server.get<{
    Params: { operationId: string };
    Reply: ApiResponse<BulkProgressResponse> | ApiErrorResponse;
  }>("/admin/api/retry/progress/:operationId", async (request, reply) => {
    const progress = await getProgress(request.params.operationId);
    if (!progress) {
      return reply
        .code(404)
        .send({ error: "Operation not found or expired" });
    }
    return reply.send({ data: progress });
  });

  // POST /admin/api/retry/cancel/:operationId - Cancel bulk operation
  server.post<{
    Params: { operationId: string };
    Reply: ApiResponse<{ message: string }> | ApiErrorResponse;
  }>("/admin/api/retry/cancel/:operationId", async (request, reply) => {
    await cancelProgress(request.params.operationId);
    return reply.send({ data: { message: "Cancellation requested" } });
  });
}
