import type { FastifyInstance } from "fastify";
import { deleteApp } from "../../services/app-deletion.js";
import type { ApiResponse, ApiErrorResponse } from "@docora/shared-types";
import type { DeleteAppResult } from "../../services/app-deletion.js";

export async function deleteAppRoute(server: FastifyInstance): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    if (!request.session?.get("adminId")) {
      reply
        .code(401)
        .send({ error: "Unauthorized" } satisfies ApiErrorResponse);
    }
  });

  server.delete<{
    Params: { appId: string };
    Reply: ApiResponse<DeleteAppResult> | ApiErrorResponse;
  }>("/admin/api/apps/:appId", async (request, reply) => {
    const { appId } = request.params;

    const result = await deleteApp(appId);

    if (!result.deleted) {
      return reply.code(404).send({ error: "App not found" });
    }

    return reply.send({ data: result });
  });
}
