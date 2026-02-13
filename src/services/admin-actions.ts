import { Queue } from "bullmq";
import { getDatabase } from "../db/index.js";
import { getRedisUrl, getRedisOptions } from "../queue/connection.js";
import {
  SNAPSHOT_QUEUE_NAME,
  type SnapshotJobData,
} from "../workers/snapshot.worker.js";
import {
  generateOperationId,
  createProgress,
  incrementProgress,
  isCancelled,
} from "./bulk-progress.js";
import { clearDeliveries } from "../repositories/deliveries.js";

let queue: Queue<SnapshotJobData> | null = null;

function getQueue(): Queue<SnapshotJobData> {
  if (!queue) {
    queue = new Queue<SnapshotJobData>(SNAPSHOT_QUEUE_NAME, {
      connection: {
        url: getRedisUrl(),
        ...getRedisOptions(),
      },
    });
  }
  return queue;
}

/** Fetch app-repository link with all data needed for a snapshot job. */
async function fetchAppRepositoryData(appId: string, repositoryId: string) {
  const db = getDatabase();

  return db
    .selectFrom("app_repositories")
    .innerJoin("apps", "apps.app_id", "app_repositories.app_id")
    .innerJoin(
      "repositories",
      "repositories.repository_id",
      "app_repositories.repository_id"
    )
    .select([
      "app_repositories.app_id",
      "app_repositories.repository_id",
      "app_repositories.status",
      "app_repositories.github_token_encrypted",
      "apps.app_name",
      "apps.base_url",
      "apps.client_auth_key_encrypted",
      "repositories.github_url",
      "repositories.owner",
      "repositories.name",
    ])
    .where("app_repositories.app_id", "=", appId)
    .where("app_repositories.repository_id", "=", repositoryId)
    .executeTakeFirst();
}

/** Reset app-repository status to pending_snapshot and clear retry state. */
async function resetAppRepository(
  appId: string,
  repositoryId: string
): Promise<void> {
  const db = getDatabase();

  await db
    .updateTable("app_repositories")
    .set({ status: "pending_snapshot", retry_count: 0, last_error: null })
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .execute();
}

/** Reset and queue a single snapshot job. Returns the job ID. */
async function resetAndQueue(
  appId: string,
  repositoryId: string
): Promise<string> {
  const row = await fetchAppRepositoryData(appId, repositoryId);
  if (!row) throw new Error("App-repository link not found");

  await resetAppRepository(appId, repositoryId);

  const q = getQueue();
  const jobId = `${appId}-${repositoryId}`;

  const existingJob = await q.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "waiting" || state === "active" || state === "delayed") {
      return jobId;
    }
    await existingJob.remove();
  }

  const jobData: SnapshotJobData = {
    app_id: row.app_id,
    app_name: row.app_name,
    repository_id: row.repository_id,
    github_url: row.github_url,
    owner: row.owner,
    name: row.name,
    base_url: row.base_url,
    github_token_encrypted: row.github_token_encrypted,
    client_auth_key_encrypted: row.client_auth_key_encrypted,
    isRescan: true,
  };

  await q.add("snapshot", jobData, { jobId });
  console.log(`[admin-actions] Retry queued: ${jobId}`);
  return jobId;
}

/** Retry a single failed app-repository pair. */
export async function retrySingle(
  appId: string,
  repositoryId: string
): Promise<{ jobId: string }> {
  const row = await fetchAppRepositoryData(appId, repositoryId);
  if (!row) throw new Error("App-repository link not found");
  if (row.status !== "failed") {
    throw new Error("Only failed entries can be retried");
  }

  const jobId = await resetAndQueue(appId, repositoryId);
  return { jobId };
}

/** Query all failed app_repositories, optionally filtered by appId. */
async function fetchFailedRows(appId?: string) {
  const db = getDatabase();

  let query = db
    .selectFrom("app_repositories")
    .select(["app_id", "repository_id"])
    .where("status", "=", "failed");

  if (appId) {
    query = query.where("app_id", "=", appId);
  }

  return query.execute();
}

/** Process a list of failed rows with progress tracking. */
async function processBulkRetries(
  operationId: string,
  rows: { app_id: string; repository_id: string }[]
): Promise<void> {
  for (const row of rows) {
    if (await isCancelled(operationId)) break;

    try {
      await resetAndQueue(row.app_id, row.repository_id);
      await incrementProgress(operationId, true);
    } catch (err) {
      console.error(`[admin-actions] Bulk retry failed for ${row.app_id}-${row.repository_id}:`, err);
      await incrementProgress(operationId, false);
    }
  }
}

/** Retry all failed notifications for a specific app. */
export async function retryByApp(
  appId: string
): Promise<{ operationId: string; total: number }> {
  const rows = await fetchFailedRows(appId);
  if (rows.length === 0) {
    throw new Error("No failed notifications for this app");
  }

  const operationId = generateOperationId();
  await createProgress(operationId, rows.length);

  // Fire-and-forget background processing
  void processBulkRetries(operationId, rows);

  return { operationId, total: rows.length };
}

/** Retry all failed notifications across all apps. */
export async function retryAll(): Promise<{
  operationId: string;
  total: number;
}> {
  const rows = await fetchFailedRows();
  if (rows.length === 0) {
    throw new Error("No failed notifications found");
  }

  const operationId = generateOperationId();
  await createProgress(operationId, rows.length);

  void processBulkRetries(operationId, rows);

  return { operationId, total: rows.length };
}

/** Clear deliveries, reset status, and queue a fresh snapshot job. */
async function resyncAndQueue(
  appId: string,
  repositoryId: string
): Promise<string> {
  const row = await fetchAppRepositoryData(appId, repositoryId);
  if (!row) throw new Error("App-repository link not found");

  await clearDeliveries(appId, repositoryId);
  await resetAppRepository(appId, repositoryId);

  const q = getQueue();
  const jobId = `${appId}-${repositoryId}`;

  const existingJob = await q.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "waiting" || state === "active" || state === "delayed") {
      return jobId;
    }
    await existingJob.remove();
  }

  const jobData: SnapshotJobData = {
    app_id: row.app_id,
    app_name: row.app_name,
    repository_id: row.repository_id,
    github_url: row.github_url,
    owner: row.owner,
    name: row.name,
    base_url: row.base_url,
    github_token_encrypted: row.github_token_encrypted,
    client_auth_key_encrypted: row.client_auth_key_encrypted,
    isRescan: false,
  };

  await q.add("snapshot", jobData, { jobId });
  console.log(`[admin-actions] Re-sync queued: ${jobId}`);
  return jobId;
}

/** Re-sync a single app-repository pair (any status). */
export async function resyncSingle(
  appId: string,
  repositoryId: string
): Promise<{ jobId: string }> {
  const row = await fetchAppRepositoryData(appId, repositoryId);
  if (!row) throw new Error("App-repository link not found");

  const jobId = await resyncAndQueue(appId, repositoryId);
  return { jobId };
}

/** Query all app_repositories for a given app. */
async function fetchAppRows(appId: string) {
  const db = getDatabase();

  return db
    .selectFrom("app_repositories")
    .select(["app_id", "repository_id"])
    .where("app_id", "=", appId)
    .execute();
}

/** Process a list of repos with resync and progress tracking. */
async function processBulkResyncs(
  operationId: string,
  rows: { app_id: string; repository_id: string }[]
): Promise<void> {
  for (const row of rows) {
    if (await isCancelled(operationId)) break;

    try {
      await resyncAndQueue(row.app_id, row.repository_id);
      await incrementProgress(operationId, true);
    } catch (err) {
      console.error(`[admin-actions] Bulk resync failed for ${row.app_id}-${row.repository_id}:`, err);
      await incrementProgress(operationId, false);
    }
  }
}

/** Re-sync all repositories for a specific app. */
export async function resyncByApp(
  appId: string
): Promise<{ operationId: string; total: number }> {
  const rows = await fetchAppRows(appId);
  if (rows.length === 0) {
    throw new Error("No repositories for this app");
  }

  const operationId = generateOperationId();
  await createProgress(operationId, rows.length);

  void processBulkResyncs(operationId, rows);

  return { operationId, total: rows.length };
}

/** Close the action queue connection for cleanup. */
export async function closeActionQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
