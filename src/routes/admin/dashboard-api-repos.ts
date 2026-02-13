import type { FastifyInstance } from "fastify";
import { listAllRepositories } from "../../repositories/admin-dashboard.js";
import { parseQueryParams, validateSortColumn } from "./query-params.js";
import type {
  RepositorySummary,
  ListQueryParams,
  PaginatedResponse,
  ApiResponse,
  ApiErrorResponse,
} from "@docora/shared-types";

const REPOS_SORT_COLUMNS = {
  name: "repositories.name",
  status: "app_repositories.status",
  last_scanned_at: "app_repositories.last_scanned_at",
  created_at: "repositories.created_at",
} as const;

const VALID_STATUSES = ["synced", "failed", "pending_snapshot", "scanning"];

export async function reposRoutes(server: FastifyInstance): Promise<void> {
  // GET /admin/api/repositories - List all repositories (paginated)
  server.get<{
    Querystring: ListQueryParams & { status?: string };
    Reply: ApiResponse<PaginatedResponse<RepositorySummary>> | ApiErrorResponse;
  }>("/admin/api/repositories", async (request, reply) => {
    const params = parseQueryParams(request.query, {
      sort_by: "created_at",
      sort_order: "desc",
    });

    const dbColumn = validateSortColumn(params.sort_by, REPOS_SORT_COLUMNS);
    if (!dbColumn) {
      return reply
        .code(400)
        .send({ error: `Invalid sort_by: ${params.sort_by}` });
    }

    const statusFilter = (request.query as { status?: string }).status;
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return reply
        .code(400)
        .send({ error: `Invalid status: ${statusFilter}` });
    }

    try {
      const result = await listAllRepositories({
        ...params,
        sort_by: dbColumn,
        status: statusFilter,
      });

      const mapped: PaginatedResponse<RepositorySummary> = {
        data: result.data.map((repo) => ({
          repository_id: repo.repository_id,
          github_url: repo.github_url,
          owner: repo.owner,
          name: repo.name,
          status: repo.status as RepositorySummary["status"],
          last_scanned_at: repo.last_scanned_at?.toISOString() ?? null,
          circuit_open: repo.circuit_open,
          app_id: repo.app_id,
        })),
        pagination: result.pagination,
      };

      return reply.send({ data: mapped });
    } catch (error) {
      console.error("Error fetching repositories:", error);
      return reply.code(500).send({ error: "Failed to fetch repositories" });
    }
  });
}
