/**
  1. Clone/pull repo
  2. Scan files
  3. Get previous hashes from DB
  4. Detect changes (delete/create/update)
  5. For each change (in order):
     └─► POST /{base_url}/delete|create|update
  6. Save new snapshot to DB
  7. Mark as synced
 */

import { Worker, Job } from "bullmq";
import { cloneOrPull } from "../services/git.js";
import { parseDocoraignore } from "../utils/docoraignore.js";
import { scanRepository } from "../services/scanner.js";
import { defaultPipeline } from "../plugins/pipeline.js";
import {
  sendFileNotification,
  buildCreatePayload,
  buildUpdatePayload,
  buildDeletePayload,
  type RepositoryInfo,
  type NotificationResult,
} from "../services/notifier.js";
import {
  saveSnapshot,
  getSnapshotFileHashes,
} from "../repositories/snapshots.js";
import {
  updateAppRepositoryStatus,
  incrementRetryCount,
  resetRetryCount,
} from "../repositories/repositories.js";
import { decryptToken } from "../utils/crypto.js";
import { getRedisUrl, getRedisOptions } from "../queue/connection.js";
import {
  detectAndSortChanges,
  isInitialSnapshot,
  type FileChange,
} from "../services/change-detector.js";

export const SNAPSHOT_QUEUE_NAME = "snapshot-queue";

export interface SnapshotJobData {
  app_id: string;
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  base_url: string;
  github_token_encrypted: string | null;
  client_auth_key_encrypted: string;
}

const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || "5", 10);

/**
 * Send notification for a single file change
 */
async function sendChangeNotification(
  change: FileChange,
  repositoryInfo: RepositoryInfo,
  commitSha: string,
  baseUrl: string,
  appId: string,
  clientAuthKey: string
): Promise<NotificationResult> {
  switch (change.type) {
    case "created":
      return sendFileNotification(
        baseUrl,
        "create",
        buildCreatePayload(repositoryInfo, change.currentFile!, commitSha),
        appId,
        clientAuthKey
      );

    case "updated":
      return sendFileNotification(
        baseUrl,
        "update",
        buildUpdatePayload(
          repositoryInfo,
          change.currentFile!,
          change.previousSha!,
          commitSha
        ),
        appId,
        clientAuthKey
      );

    case "deleted":
      return sendFileNotification(
        baseUrl,
        "delete",
        buildDeletePayload(
          repositoryInfo,
          change.path,
          change.previousSha!,
          commitSha
        ),
        appId,
        clientAuthKey
      );
  }
}

/**
 * Process a snapshot job with granular file notifications
 */
async function processSnapshotJob(job: Job<SnapshotJobData>): Promise<void> {
  const {
    app_id,
    repository_id,
    github_url,
    owner,
    name,
    base_url,
    github_token_encrypted,
    client_auth_key_encrypted,
  } = job.data;

  console.log(`Processing snapshot job: ${app_id}/${repository_id}`);

  // Mark as scanning
  await updateAppRepositoryStatus(app_id, repository_id, "scanning");

  try {
    // 1. Decrypt tokens
    const githubToken = github_token_encrypted
      ? decryptToken(github_token_encrypted)
      : undefined;
    const clientAuthKey = decryptToken(client_auth_key_encrypted);

    // 2. Clone or pull repository
    const { localPath, commitSha, branch } = await cloneOrPull(
      github_url,
      owner,
      name,
      githubToken
    );

    // 3. Parse .docoraignore
    const ig = parseDocoraignore(localPath);

    // 4. Scan repository files
    const scannedFiles = await scanRepository(localPath, ig);

    // 5. Apply plugin pipeline (passthrough for now)
    const processedFiles = await defaultPipeline.execute(scannedFiles);

    // 6. Get previous snapshot file hashes for change detection
    const previousFileHashes = await getSnapshotFileHashes(repository_id);

    // 7. Detect changes (sorted: delete → create → update)
    const changes = detectAndSortChanges(processedFiles, previousFileHashes);

    const repositoryInfo: RepositoryInfo = {
      repository_id,
      github_url,
      owner,
      name,
    };

    // 8. Log change summary
    if (isInitialSnapshot(previousFileHashes)) {
      console.log(
        `Initial snapshot for ${repository_id}: ${processedFiles.length} files to create`
      );
    } else {
      const created = changes.filter((c) => c.type === "created").length;
      const updated = changes.filter((c) => c.type === "updated").length;
      const deleted = changes.filter((c) => c.type === "deleted").length;
      console.log(
        `Changes detected for ${repository_id}: ${created} created, ${updated} updated, ${deleted} deleted`
      );
    }

    // 9. Send notifications for each change
    let failedCount = 0;
    for (const change of changes) {
      const result = await sendChangeNotification(
        change,
        repositoryInfo,
        commitSha,
        base_url,
        app_id,
        clientAuthKey
      );

      if (!result.success) {
        failedCount++;
        // Log but continue with other files
        console.error(
          `Failed to notify ${change.type} for ${change.path}: ${result.error}`
        );

        // If it's a client error (4xx), don't retry the whole job
        if (!result.shouldRetry) {
          console.warn(
            `Client error for ${change.path}, skipping (won't retry)`
          );
          continue;
        }

        // For server errors, we might want to fail the whole job
        // depending on your retry strategy
        if (result.shouldRetry) {
          throw new Error(
            `Failed to send ${change.type} notification for ${change.path}: ${result.error}`
          );
        }
      }
    }

    // 10. Save snapshot to database (only if all notifications succeeded)
    await saveSnapshot(repository_id, commitSha, branch, processedFiles);

    // 11. Update status to synced
    await updateAppRepositoryStatus(app_id, repository_id, "synced");
    await resetRetryCount(app_id, repository_id);

    console.log(
      `Snapshot job completed: ${app_id}/${repository_id} (${changes.length} changes)`
    );
  } catch (err) {
    const error = err as Error;
    console.error(
      `Snapshot job failed: ${app_id}/${repository_id}`,
      error.message
    );

    // Increment retry count
    const retryCount = await incrementRetryCount(
      app_id,
      repository_id,
      error.message
    );

    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      // Max retries exceeded - mark as failed
      await updateAppRepositoryStatus(
        app_id,
        repository_id,
        "failed",
        error.message
      );
      console.error(`Max retries exceeded for ${app_id}/${repository_id}`);
    } else {
      // Reset to pending for retry
      await updateAppRepositoryStatus(
        app_id,
        repository_id,
        "pending_snapshot"
      );
    }

    // Re-throw to let BullMQ handle retry
    throw error;
  }
}

/**
 * Create and start the snapshot worker
 */
export function createSnapshotWorker(): Worker<SnapshotJobData> {
  const worker = new Worker<SnapshotJobData>(
    SNAPSHOT_QUEUE_NAME,
    processSnapshotJob,
    {
      connection: {
        url: getRedisUrl(),
        ...getRedisOptions(),
      },
      concurrency: parseInt(process.env.SCAN_CONCURRENCY || "5", 10),
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  console.log("Snapshot worker started");
  return worker;
}
