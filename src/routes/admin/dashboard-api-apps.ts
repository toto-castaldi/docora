import type { FastifyInstance } from "fastify";
import {
  listAppsWithCounts,
  getAppById,
  listRepositoriesByApp,
  countSnapshotsByApp,
  countDeliveriesByApp,
} from "../../repositories/admin-dashboard.js";
import type { RepositoryWithStatus } from "../../repositories/admin-dashboard.js";
import { parseQueryParams, validateSortColumn } from "./query-params.js";
import type {
  AppSummary,
  AppDetail,
  RepositorySummary,
  ListQueryParams,
  PaginatedResponse,
  ApiResponse,
  ApiErrorResponse,
} from "@docora/shared-types";

function countFailed(repos: RepositoryWithStatus[]): number {
  return repos.filter((r) => r.status === "failed").length;
}

const APPS_SORT_COLUMNS = {
  app_name: "apps.app_name",
  created_at: "apps.created_at",
  repository_count: "repository_count",
  failed_notification_count: "failed_notification_count",
} as const;

export async function appsRoutes(server: FastifyInstance): Promise<void> {
  // GET /admin/api/apps - List all apps with counts (paginated)
  server.get<{
    Querystring: ListQueryParams;
    Reply: ApiResponse<PaginatedResponse<AppSummary>> | ApiErrorResponse;
  }>("/admin/api/apps", async (request, reply) => {
    const params = parseQueryParams(request.query, {
      sort_by: "created_at",
      sort_order: "desc",
    });

    const dbColumn = validateSortColumn(params.sort_by, APPS_SORT_COLUMNS);
    if (!dbColumn) {
      return reply.code(400).send({ error: `Invalid sort_by: ${params.sort_by}` });
    }

    try {
      const result = await listAppsWithCounts({ ...params, sort_by: dbColumn });

      const mapped: PaginatedResponse<AppSummary> = {
        data: result.data.map((app) => ({
          app_id: app.app_id,
          app_name: app.app_name,
          base_url: app.base_url,
          created_at: app.created_at.toISOString(),
          repository_count: app.repository_count,
          failed_notification_count: app.failed_notification_count,
        })),
        pagination: result.pagination,
      };

      return reply.send({ data: mapped });
    } catch (error) {
      console.error("Error fetching apps:", error);
      return reply.code(500).send({ error: "Failed to fetch apps" });
    }
  });

  // GET /admin/api/apps/:appId - Get app detail with repositories
  server.get<{
    Params: { appId: string };
    Reply: ApiResponse<AppDetail> | ApiErrorResponse;
  }>("/admin/api/apps/:appId", async (request, reply) => {
    try {
      const { appId } = request.params;
      const app = await getAppById(appId);

      if (!app) {
        return reply.code(404).send({ error: "App not found" });
      }

      const [repos, snapshotCount, deliveryCount] = await Promise.all([
        listRepositoriesByApp(appId),
        countSnapshotsByApp(appId),
        countDeliveriesByApp(appId),
      ]);

      const repositories: RepositorySummary[] = repos.map((repo) => ({
        repository_id: repo.repository_id,
        github_url: repo.github_url,
        owner: repo.owner,
        name: repo.name,
        status: repo.status as RepositorySummary["status"],
        last_scanned_at: repo.last_scanned_at?.toISOString() ?? null,
        circuit_open: repo.circuit_open,
      }));

      const failedCount = countFailed(repos);

      const response: AppDetail = {
        app_id: app.app_id,
        app_name: app.app_name,
        base_url: app.base_url,
        email: app.email,
        website: app.website,
        description: app.description,
        created_at: app.created_at.toISOString(),
        repository_count: repos.length,
        failed_notification_count: failedCount,
        snapshot_count: snapshotCount,
        delivery_count: deliveryCount,
        repositories,
      };

      return reply.send({ data: response });
    } catch (error) {
      console.error("Error fetching app detail:", error);
      return reply.code(500).send({ error: "Failed to fetch app detail" });
    }
  });
}
