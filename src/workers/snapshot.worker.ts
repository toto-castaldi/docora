/**
  1. Clone/pull repo
  2. Scan files
  3. Get delivered files for this app (per-app tracking)
  4. Detect changes (delete/create/update)
  5. For each change (in order):
     └─► POST /{base_url}/delete|create|update
     └─► Record delivery in app_delivered_files
  6. Save new snapshot to DB (repository state)
  7. Mark as synced
 */

import { Worker, Job } from "bullmq";
import { cloneOrPull } from "../services/git.js";
import { scanRepository } from "../services/scanner.js";
import { defaultPipeline } from "../plugins/pipeline.js";
import {
  sendFileNotification,
  buildDeletePayload,
  type RepositoryInfo,
} from "../services/notifier.js";
import { sendFileWithChunking } from "../services/chunked-notifier.js";

import { saveSnapshot } from "../repositories/snapshots.js";
import {
  getDeliveredFiles,
  recordDelivery,
  removeDelivery,
} from "../repositories/deliveries.js";
import {
  updateAppRepositoryStatus,
  incrementRetryCount,
  resetRetryCount,
  recordGitFailure,
  resetGitFailures,
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
  app_name: string;
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  base_url: string;
  github_token_encrypted: string | null;
  client_auth_key_encrypted: string;
  isRescan: boolean;
}

const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || "5", 10);

/** Common result type for change notifications */
interface ChangeNotificationResult {
  success: boolean;
  error?: string;
  shouldRetry: boolean;
}

/**
 * Send notification for a single file change.
 * Uses chunked delivery for large binary files.
 */
async function sendChangeNotification(
  change: FileChange,
  repositoryInfo: RepositoryInfo,
  commitSha: string,
  baseUrl: string,
  appId: string,
  clientAuthKey: string,
  appName: string
): Promise<ChangeNotificationResult> {
  switch (change.type) {
    case "created":
      return sendFileWithChunking(
        baseUrl,
        "create",
        repositoryInfo,
        change.currentFile!,
        commitSha,
        appId,
        clientAuthKey,
        undefined,
        appName
      );

    case "updated":
      return sendFileWithChunking(
        baseUrl,
        "update",
        repositoryInfo,
        change.currentFile!,
        commitSha,
        appId,
        clientAuthKey,
        change.previousSha,
        appName
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
        clientAuthKey,
        appName
      );
  }
}

/**
 * Process a snapshot job with granular file notifications
 */
async function processSnapshotJob(job: Job<SnapshotJobData>): Promise<void> {
  const {
    app_id,
    app_name,
    repository_id,
    github_url,
    owner,
    name,
    base_url,
    github_token_encrypted,
    client_auth_key_encrypted,
    isRescan,
  } = job.data;

  const logPrefix = `[${app_name}-${app_id}]`;

  console.log(
    `${logPrefix} Processing ${isRescan ? "rescan" : "initial"} job: ${repository_id}`
  );

  // Mark as scanning
  await updateAppRepositoryStatus(app_id, repository_id, "scanning");

  try {
    // 1. Decrypt tokens
    const githubToken = github_token_encrypted
      ? decryptToken(github_token_encrypted)
      : undefined;
    const clientAuthKey = decryptToken(client_auth_key_encrypted);

    // 2. Clone or pull repository (with circuit breaker)
    let localPath: string;
    let commitSha: string;
    let branch: string;

    try {
      const result = await cloneOrPull(
        github_url,
        owner,
        name,
        githubToken
      );
      localPath = result.localPath;
      commitSha = result.commitSha;
      branch = result.branch;

      // Git succeeded - reset circuit breaker
      await resetGitFailures(repository_id);
    } catch (gitError) {
      // Git failure - record for circuit breaker
      const { circuitOpened } = await recordGitFailure(repository_id);
      if (circuitOpened) {
        console.error(
          `${logPrefix} Circuit breaker OPENED for ${repository_id} - pausing scans`
        );
      }
      throw gitError; // Re-throw to trigger normal error handling
    }

    // 2. Scan repository files (all files except .git)
    const scannedFiles = await scanRepository(localPath);

    // Apply plugin pipeline (passthrough for now)
    const processedFiles = await defaultPipeline.execute(scannedFiles);

    // 3. Get delivered files for this app (per-app tracking)
    const deliveredFiles = await getDeliveredFiles(app_id, repository_id);

    // 4. Detect changes (sorted: delete → create → update)
    const changes = detectAndSortChanges(processedFiles, deliveredFiles);

    const repositoryInfo: RepositoryInfo = {
      repository_id,
      github_url,
      owner,
      name,
    };

    // Log change summary
    const repoLabel = `${repository_id} (${owner}/${name})`;

    if (isInitialSnapshot(deliveredFiles)) {
      console.log(`${logPrefix} 📦 Initial snapshot for ${repoLabel}`);
      console.log(`${logPrefix}    ${processedFiles.length} files to create:`);
      for (const file of processedFiles) {
        const typeIcon = file.isBinary ? "🖼️ " : "📄";
        console.log(`${logPrefix}      ${typeIcon} ${file.path}`);
      }
    } else if (changes.length === 0) {
      console.log(`${logPrefix} ✅ No changes for ${repoLabel}`);
    } else {
      const createdFiles = changes.filter((c) => c.type === "created");
      const updatedFiles = changes.filter((c) => c.type === "updated");
      const deletedFiles = changes.filter((c) => c.type === "deleted");

      console.log(`${logPrefix} 🔄 Changes detected for ${repoLabel}`);
      console.log(
        `${logPrefix}    ${createdFiles.length} created, ${updatedFiles.length} updated, ${deletedFiles.length} deleted`
      );

      if (deletedFiles.length > 0) {
        console.log(`${logPrefix}    🗑️  Deleted:`);
        for (const c of deletedFiles) console.log(`${logPrefix}        - ${c.path}`);
      }
      if (createdFiles.length > 0) {
        console.log(`${logPrefix}    ✨ Created:`);
        for (const c of createdFiles) {
          const icon = c.currentFile?.isBinary ? "🖼️ " : "";
          console.log(`${logPrefix}        + ${icon}${c.path}`);
        }
      }
      if (updatedFiles.length > 0) {
        console.log(`${logPrefix}    ✏️  Updated:`);
        for (const c of updatedFiles) {
          const icon = c.currentFile?.isBinary ? "🖼️ " : "";
          console.log(`${logPrefix}        ~ ${icon}${c.path}`);
        }
      }
    }

    // 5. Send notifications for each change
    // Any failure stops immediately and triggers job retry
    // Record delivery after each successful notification
    for (const change of changes) {
      const result = await sendChangeNotification(
        change,
        repositoryInfo,
        commitSha,
        base_url,
        app_id,
        clientAuthKey,
        app_name
      );

      if (!result.success) {
        throw new Error(
          `Notification failed for ${change.type} ${change.path}: ${result.error}`
        );
      }

      // Record successful delivery
      if (change.type === "deleted") {
        await removeDelivery(app_id, repository_id, change.path);
      } else {
        await recordDelivery(
          app_id,
          repository_id,
          change.path,
          change.currentFile!.sha
        );
      }
    }

    // 6. Save snapshot to database (repository state tracking)
    await saveSnapshot(repository_id, commitSha, branch, processedFiles);

    // 7. Update status to synced
    await updateAppRepositoryStatus(app_id, repository_id, "synced");
    await resetRetryCount(app_id, repository_id);

    console.log(
      `${logPrefix} Snapshot job completed: ${repository_id} (${changes.length} changes)`
    );
  } catch (err) {
    const error = err as Error;
    console.error(
      `${logPrefix} Snapshot job failed: ${repository_id}`,
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
      console.error(`${logPrefix} Max retries exceeded for ${repository_id}`);
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

