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
  buildDeletePayload,
  type RepositoryInfo,
} from "../services/notifier.js";
import { sendFileWithChunking } from "../services/chunked-notifier.js";

import {
  saveSnapshot,
  getSnapshotFileHashes,
} from "../repositories/snapshots.js";
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
  clientAuthKey: string
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
        clientAuthKey
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
        change.previousSha
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
    isRescan,
  } = job.data;

  console.log(
    `Processing ${isRescan ? "rescan" : "initial"} job: ${app_id}/${repository_id}`
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
          `Circuit breaker OPENED for ${repository_id} - pausing scans`
        );
      }
      throw gitError; // Re-throw to trigger normal error handling
    }

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
    const repoLabel = `${repository_id} (${owner}/${name})`;

    if (isInitialSnapshot(previousFileHashes)) {
      console.log(`\n📦 Initial snapshot for ${repoLabel}`);
      console.log(`   ${processedFiles.length} files to create:`);
      for (const file of processedFiles) {
        const typeIcon = file.isBinary ? "🖼️ " : "📄";
        console.log(`     ${typeIcon} ${file.path}`);
      }
    } else {
      const createdFiles = changes.filter((c) => c.type === "created");
      const updatedFiles = changes.filter((c) => c.type === "updated");
      const deletedFiles = changes.filter((c) => c.type === "deleted");

      console.log(`\n🔄 Changes detected for ${repoLabel}`);
      console.log(
        `   ${createdFiles.length} created, ${updatedFiles.length} updated, ${deletedFiles.length} deleted`
      );

      if (deletedFiles.length > 0) {
        console.log("   🗑️  Deleted:");
        for (const c of deletedFiles) console.log(`       - ${c.path}`);
      }
      if (createdFiles.length > 0) {
        console.log("   ✨ Created:");
        for (const c of createdFiles) {
          const icon = c.currentFile?.isBinary ? "🖼️ " : "";
          console.log(`       + ${icon}${c.path}`);
        }
      }
      if (updatedFiles.length > 0) {
        console.log("   ✏️  Updated:");
        for (const c of updatedFiles) {
          const icon = c.currentFile?.isBinary ? "🖼️ " : "";
          console.log(`       ~ ${icon}${c.path}`);
        }
      }
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

