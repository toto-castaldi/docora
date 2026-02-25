import { Queue } from "bullmq";
import { getDatabase } from "../db/index.js";
import { getRedisUrl, getRedisOptions } from "../queue/connection.js";
import {
  SNAPSHOT_QUEUE_NAME,
  type SnapshotJobData,
} from "../workers/snapshot.worker.js";
import {
  findRepositoriesByAppId,
  isRepositoryOrphan,
  deleteRepository,
} from "../repositories/repositories.js";
import { deleteLocalRepository } from "./git.js";
import { withRepoLock } from "./repo-lock.js";

export interface DeleteAppResult {
  deleted: boolean;
  repositories_unlinked: number;
  orphaned_repositories_cleaned: number;
}

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

/**
 * Delete an app and all dependent records.
 *
 * 1. Verify app exists
 * 2. Gather repos before deletion
 * 3. DB transaction: delete deliveries, app_repositories, apps (FK-safe order)
 * 4. Post-transaction: orphan cleanup (DB + disk, best-effort)
 * 5. Post-transaction: remove pending BullMQ jobs (best-effort)
 */
export async function deleteApp(appId: string): Promise<DeleteAppResult> {
  const db = getDatabase();

  const appExists = await db
    .selectFrom("apps")
    .select("app_id")
    .where("app_id", "=", appId)
    .executeTakeFirst();

  if (!appExists) {
    return { deleted: false, repositories_unlinked: 0, orphaned_repositories_cleaned: 0 };
  }

  const repos = await findRepositoriesByAppId(appId);

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("app_delivered_files").where("app_id", "=", appId).execute();
    await trx.deleteFrom("app_repositories").where("app_id", "=", appId).execute();
    await trx.deleteFrom("apps").where("app_id", "=", appId).execute();
  });

  const cleanedCount = await cleanupOrphanedRepos(repos, appId);
  await removePendingJobs(repos, appId);

  console.log(`[app-deletion] Deleted app ${appId}: ${repos.length} repos unlinked, ${cleanedCount} orphans cleaned`);

  return {
    deleted: true,
    repositories_unlinked: repos.length,
    orphaned_repositories_cleaned: cleanedCount,
  };
}

/** Clean up orphaned repositories (DB + disk). Best-effort, log and continue. */
async function cleanupOrphanedRepos(
  repos: Array<{ repository_id: string; owner: string; name: string }>,
  appId: string
): Promise<number> {
  let cleanedCount = 0;

  for (const repo of repos) {
    const orphan = await isRepositoryOrphan(repo.repository_id);
    if (!orphan) continue;

    await deleteRepository(repo.repository_id);
    cleanedCount++;

    try {
      await withRepoLock(
        `${repo.owner}/${repo.name}`,
        `delete-app-${appId}`,
        async () => {
          deleteLocalRepository(repo.owner, repo.name);
        }
      );
    } catch (err) {
      console.error(`[app-deletion] Failed to delete local clone for ${repo.owner}/${repo.name}:`, err);
    }
  }

  return cleanedCount;
}

/** Remove pending/delayed BullMQ jobs for deleted app. Best-effort, log and continue. */
async function removePendingJobs(
  repos: Array<{ repository_id: string }>,
  appId: string
): Promise<void> {
  const q = getQueue();

  for (const repo of repos) {
    const jobId = `${appId}-${repo.repository_id}`;
    try {
      const job = await q.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === "waiting" || state === "delayed") {
          await job.remove();
          console.log(`[app-deletion] Removed pending job ${jobId}`);
        }
      }
    } catch (err) {
      console.error(`[app-deletion] Failed to remove job ${jobId}:`, err);
    }
  }
}

/** Close the delete queue connection for cleanup. */
export async function closeDeleteQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
