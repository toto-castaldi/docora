import type { FastifyInstance } from "fastify";
import {
  getQueueStatus,
  getQueueJobs,
} from "../../services/queue-status.js";
import { getOverviewCounts } from "../../repositories/admin-dashboard.js";
import type {
  QueueStatus,
  QueueJob,
  OverviewMetrics,
  ApiResponse,
  ApiErrorResponse,
} from "@docora/shared-types";

export async function queueRoutes(server: FastifyInstance): Promise<void> {
  // GET /admin/api/queue - Get queue status and jobs (not paginated)
  server.get<{
    Reply:
      | ApiResponse<{ status: QueueStatus; jobs: QueueJob[] }>
      | ApiErrorResponse;
  }>("/admin/api/queue", async (_request, reply) => {
    try {
      const [status, jobs] = await Promise.all([
        getQueueStatus(),
        getQueueJobs(50),
      ]);

      return reply.send({
        data: {
          status: {
            waiting: status.waiting,
            active: status.active,
            completed: status.completed,
            failed: status.failed,
            delayed: status.delayed,
          },
          jobs: jobs.map((job) => ({
            id: job.id,
            name: job.name,
            app_name: job.app_name,
            repository_name: job.repository_name,
            status: job.status,
            created_at: job.created_at,
            processed_on: job.processed_on,
          })),
        },
      });
    } catch (error) {
      console.error("Error fetching queue status:", error);
      return reply.code(500).send({ error: "Failed to fetch queue status" });
    }
  });

  // GET /admin/api/overview - Get overview metrics (not paginated)
  server.get<{ Reply: ApiResponse<OverviewMetrics> | ApiErrorResponse }>(
    "/admin/api/overview",
    async (_request, reply) => {
      try {
        const [counts, queueStatus] = await Promise.all([
          getOverviewCounts(),
          getQueueStatus(),
        ]);

        const response: OverviewMetrics = {
          total_apps: counts.total_apps,
          total_repositories: counts.total_repositories,
          failed_notifications: counts.failed_notifications,
          queue_waiting: queueStatus.waiting,
          queue_active: queueStatus.active,
        };

        return reply.send({ data: response });
      } catch (error) {
        console.error("Error fetching overview:", error);
        return reply.code(500).send({ error: "Failed to fetch overview" });
      }
    }
  );
}
