import { getDatabase } from "../db/index.js";
import { sql } from "kysely";
import type { AppRepositoryStatus } from "../db/types/repositories.js";
import { paginateQuery, type PaginatedResult } from "./pagination.js";
import type {
  AppWithCounts,
  RepositoryWithStatus,
  FailedNotificationResult,
  ListParams,
  RepoListParams,
} from "./admin-dashboard-types.js";

/**
 * List apps with counts - paginated, searchable, sortable
 */
export async function listAppsWithCounts(
  params: ListParams
): Promise<PaginatedResult<AppWithCounts>> {
  const db = getDatabase();
  const { sort_by, sort_order, search } = params;

  let query = db
    .selectFrom("apps")
    .select([
      "apps.app_id",
      "apps.app_name",
      "apps.base_url",
      "apps.created_at",
    ])
    .select((eb) => [
      eb
        .selectFrom("app_repositories")
        .whereRef("app_repositories.app_id", "=", "apps.app_id")
        .select(eb.fn.countAll().as("cnt"))
        .as("repository_count"),
      eb
        .selectFrom("app_repositories")
        .whereRef("app_repositories.app_id", "=", "apps.app_id")
        .where("app_repositories.status", "=", "failed")
        .select(eb.fn.countAll().as("cnt"))
        .as("failed_notification_count"),
    ]);

  if (search) {
    query = query.where((eb) =>
      eb.or([
        eb("apps.app_name", "ilike", `%${search}%`),
        eb("apps.base_url", "ilike", `%${search}%`),
      ])
    );
  }

  query = query.orderBy(sql.ref(sort_by), sort_order);

  const result = await paginateQuery(query, params);

  return {
    ...result,
    data: result.data.map((r) => ({
      app_id: r.app_id,
      app_name: r.app_name,
      base_url: r.base_url,
      created_at: r.created_at,
      repository_count: Number(r.repository_count) || 0,
      failed_notification_count: Number(r.failed_notification_count) || 0,
    })),
  };
}

/**
 * List all repositories - paginated, searchable, sortable, filterable
 */
export async function listAllRepositories(
  params: RepoListParams
): Promise<PaginatedResult<RepositoryWithStatus>> {
  const db = getDatabase();
  const { sort_by, sort_order, search, status } = params;

  let query = db
    .selectFrom("app_repositories")
    .innerJoin(
      "repositories",
      "repositories.repository_id",
      "app_repositories.repository_id"
    )
    .innerJoin("apps", "apps.app_id", "app_repositories.app_id")
    .select([
      "repositories.repository_id",
      "repositories.github_url",
      "repositories.owner",
      "repositories.name",
      "repositories.circuit_open_until",
      "app_repositories.status",
      "app_repositories.last_scanned_at",
      "apps.app_id",
      "apps.app_name",
    ]);

  if (status) {
    query = query.where(
      "app_repositories.status",
      "=",
      status as AppRepositoryStatus
    );
  }

  if (search) {
    query = query.where((eb) =>
      eb.or([
        eb("repositories.owner", "ilike", `%${search}%`),
        eb("repositories.name", "ilike", `%${search}%`),
        eb("repositories.github_url", "ilike", `%${search}%`),
      ])
    );
  }

  query = query.orderBy(sql.ref(sort_by), sort_order);

  const result = await paginateQuery(query, params);
  const now = new Date();

  return {
    ...result,
    data: result.data.map((r) => ({
      repository_id: r.repository_id,
      github_url: r.github_url,
      owner: r.owner,
      name: r.name,
      status: r.status,
      last_scanned_at: r.last_scanned_at,
      circuit_open: r.circuit_open_until ? r.circuit_open_until > now : false,
      app_id: r.app_id,
      app_name: r.app_name,
    })),
  };
}

/**
 * List failed notifications - paginated, searchable, sortable
 */
export async function listFailedNotifications(
  params: ListParams
): Promise<PaginatedResult<FailedNotificationResult>> {
  const db = getDatabase();
  const { sort_by, sort_order, search } = params;

  let query = db
    .selectFrom("app_repositories")
    .innerJoin(
      "repositories",
      "repositories.repository_id",
      "app_repositories.repository_id"
    )
    .innerJoin("apps", "apps.app_id", "app_repositories.app_id")
    .select([
      "apps.app_id",
      "apps.app_name",
      "repositories.repository_id",
      "repositories.owner",
      "repositories.name",
      "repositories.github_url",
      "app_repositories.last_error",
      "app_repositories.retry_count",
      "app_repositories.last_scanned_at",
    ])
    .where("app_repositories.status", "=", "failed");

  if (search) {
    query = query.where((eb) =>
      eb.or([
        eb("apps.app_name", "ilike", `%${search}%`),
        eb("repositories.owner", "ilike", `%${search}%`),
        eb("repositories.name", "ilike", `%${search}%`),
        eb("app_repositories.last_error", "ilike", `%${search}%`),
      ])
    );
  }

  query = query.orderBy(sql.ref(sort_by), sort_order);

  const result = await paginateQuery(query, params);

  return {
    ...result,
    data: result.data.map((r) => ({
      app_id: r.app_id,
      app_name: r.app_name,
      repository_id: r.repository_id,
      repository_name: `${r.owner}/${r.name}`,
      github_url: r.github_url,
      error_message: r.last_error ?? "Unknown error",
      retry_count: r.retry_count ?? 0,
      last_scanned_at: r.last_scanned_at,
    })),
  };
}
