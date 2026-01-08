import { Worker, Job } from "bullmq";
import { cloneOrPull } from "../services/git.js";
import { parseDocoraignore } from "../utils/docoraignore.js";
import { scanRepository } from "../services/scanner.js";
import { defaultPipeline } from "../plugins/pipeline.js";
import { sendSnapshot, buildSnapshotPayload } from "../services/notifier.js";
import { saveSnapshot } from "../repositories/snapshots.js";
import {
  updateAppRepositoryStatus,
  incrementRetryCount,
  resetRetryCount,
} from "../repositories/repositories.js";
import { decryptToken } from "../utils/crypto.js";
import { getRedisUrl, getRedisOptions } from "../queue/connection.js";

export const SNAPSHOT_QUEUE_NAME = "snapshot-queue";

export interface SnapshotJobData {
  app_id: string;
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  base_url: string;
  github_token_encrypted: string | null;
}

const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || "5", 10);

/**
 * Process a snapshot job
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
  } = job.data;

  console.log(`Processing snapshot job: ${app_id}/${repository_id}`);

  // Mark as scanning
  await updateAppRepositoryStatus(app_id, repository_id, "scanning");

  try {
    // 1. Decrypt GitHub token if present
    const githubToken = github_token_encrypted
      ? decryptToken(github_token_encrypted)
      : undefined;

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

    // 6. Build and send snapshot to app
    const payload = buildSnapshotPayload(
      {
        repository_id,
        github_url,
        owner,
        name,
      },
      commitSha,
      branch,
      processedFiles
    );

    const result = await sendSnapshot(base_url, payload);

    if (!result.success) {
      throw new Error(result.error || "Failed to send snapshot");
    }

    // 7. Save snapshot to database
    await saveSnapshot(repository_id, commitSha, branch, processedFiles);

    // 8. Update status to synced
    await updateAppRepositoryStatus(app_id, repository_id, "synced");
    await resetRetryCount(app_id, repository_id);

    console.log(`Snapshot job completed: ${app_id}/${repository_id}`);
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
