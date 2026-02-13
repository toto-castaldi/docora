import type { FastifyInstance } from "fastify";
import { listFailedNotifications } from "../../repositories/admin-dashboard.js";
import { parseQueryParams, validateSortColumn } from "./query-params.js";
import type {
  FailedNotification,
  ListQueryParams,
  PaginatedResponse,
  ApiResponse,
  ApiErrorResponse,
} from "@docora/shared-types";

const NOTIFICATIONS_SORT_COLUMNS = {
  app_name: "apps.app_name",
  repository_name: "repositories.name",
  retry_count: "app_repositories.retry_count",
  last_scanned_at: "app_repositories.last_scanned_at",
} as const;

export async function notificationsRoutes(
  server: FastifyInstance
): Promise<void> {
  // GET /admin/api/notifications/failed - List failed notifications (paginated)
  server.get<{
    Querystring: ListQueryParams;
    Reply:
      | ApiResponse<PaginatedResponse<FailedNotification>>
      | ApiErrorResponse;
  }>("/admin/api/notifications/failed", async (request, reply) => {
    const params = parseQueryParams(request.query, {
      sort_by: "last_scanned_at",
      sort_order: "desc",
    });

    const dbColumn = validateSortColumn(
      params.sort_by,
      NOTIFICATIONS_SORT_COLUMNS
    );
    if (!dbColumn) {
      return reply
        .code(400)
        .send({ error: `Invalid sort_by: ${params.sort_by}` });
    }

    try {
      const result = await listFailedNotifications({
        ...params,
        sort_by: dbColumn,
      });

      const mapped: PaginatedResponse<FailedNotification> = {
        data: result.data.map((n) => ({
          app_id: n.app_id,
          app_name: n.app_name,
          repository_id: n.repository_id,
          repository_name: n.repository_name,
          github_url: n.github_url,
          error_message: n.error_message,
          timestamp:
            n.last_scanned_at?.toISOString() ?? new Date().toISOString(),
          retry_count: n.retry_count,
        })),
        pagination: result.pagination,
      };

      return reply.send({ data: mapped });
    } catch (error) {
      console.error("Error fetching failed notifications:", error);
      return reply
        .code(500)
        .send({ error: "Failed to fetch notifications" });
    }
  });
}
