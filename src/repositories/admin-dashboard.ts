import { getDatabase } from "../db/index.js";
import type {
  AppDetailResult,
  RepositoryWithStatus,
} from "./admin-dashboard-types.js";

// Re-export all types and paginated functions for backward compat
export type {
  AppWithCounts,
  AppDetailResult,
  RepositoryWithStatus,
  FailedNotificationResult,
  ListParams,
  RepoListParams,
} from "./admin-dashboard-types.js";
export {
  listAppsWithCounts,
  listAllRepositories,
  listFailedNotifications,
} from "./admin-dashboard-lists.js";

/**
 * Get app detail by ID (not paginated)
 */
export async function getAppById(
  appId: string
): Promise<AppDetailResult | null> {
  const db = getDatabase();

  const result = await db
    .selectFrom("apps")
    .select([
      "app_id",
      "app_name",
      "base_url",
      "email",
      "website",
      "description",
      "created_at",
    ])
    .where("app_id", "=", appId)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * List repositories for a specific app (not paginated)
 */
export async function listRepositoriesByApp(
  appId: string
): Promise<RepositoryWithStatus[]> {
  const db = getDatabase();

  const results = await db
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
    ])
    .where("app_repositories.app_id", "=", appId)
    .orderBy("repositories.created_at", "desc")
    .execute();

  const now = new Date();
  return results.map((r) => ({
    repository_id: r.repository_id,
    github_url: r.github_url,
    owner: r.owner,
    name: r.name,
    status: r.status,
    last_scanned_at: r.last_scanned_at,
    circuit_open: r.circuit_open_until ? r.circuit_open_until > now : false,
    app_id: r.app_id,
    app_name: r.app_name,
  }));
}

/**
 * Get overview counts for dashboard (not paginated)
 */
export async function getOverviewCounts(): Promise<{
  total_apps: number;
  total_repositories: number;
  failed_notifications: number;
}> {
  const db = getDatabase();

  const [appsResult, reposResult, failedResult] = await Promise.all([
    db
      .selectFrom("apps")
      .select((eb) => eb.fn.count("app_id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("app_repositories")
      .select((eb) => eb.fn.count("id").as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("app_repositories")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("status", "=", "failed")
      .executeTakeFirst(),
  ]);

  return {
    total_apps: Number(appsResult?.count) || 0,
    total_repositories: Number(reposResult?.count) || 0,
    failed_notifications: Number(failedResult?.count) || 0,
  };
}
