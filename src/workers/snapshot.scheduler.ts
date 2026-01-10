/**
  ┌──────────────────────┬──────────────────────────────────────────────────┐
  │       Feature        │                  Implementation                  │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Interval             │ Configurable via SCAN_INTERVAL_MS (default: 60s) │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Duplicate prevention │ Check if job exists before adding                │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Exponential backoff  │ Configured in queue's defaultJobOptions          │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Job cleanup          │ Auto-remove old completed/failed jobs            │
  └──────────────────────┴──────────────────────────────────────────────────┘
 *
*/
import { Queue } from "bullmq";
import { getRedisUrl, getRedisOptions } from "../queue/connection.js";
import { findRepositoriesForRescan } from "../repositories/repositories.js";
import { SNAPSHOT_QUEUE_NAME, SnapshotJobData } from "./snapshot.worker.js";

const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "60000", 10);
const RETRY_BASE_DELAY_MS = parseInt(
  process.env.RETRY_BASE_DELAY_MS || "1000",
  10
);

const RESCAN_INTERVAL_MS = parseInt(
  process.env.RESCAN_INTERVAL_MS || "300000",
  10
);

let snapshotQueue: Queue<SnapshotJobData> | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Get or create the snapshot queue
 */
function getSnapshotQueue(): Queue<SnapshotJobData> {
  if (!snapshotQueue) {
    snapshotQueue = new Queue<SnapshotJobData>(SNAPSHOT_QUEUE_NAME, {
      connection: {
        url: getRedisUrl(),
        ...getRedisOptions(),
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: RETRY_BASE_DELAY_MS,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 200, // Keep last 200 failed jobs
      },
    });
  }
  return snapshotQueue;
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  console.log(`Starting scheduler (interval: ${SCAN_INTERVAL_MS}ms)`);

  // Run immediately on start
  scanAndQueuePending();

  // Then run on interval
  schedulerInterval = setInterval(scanAndQueuePending, SCAN_INTERVAL_MS);
}

/**
 * Stop the scheduler
 */
export async function stopScheduler(): Promise<void> {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  if (snapshotQueue) {
    await snapshotQueue.close();
    snapshotQueue = null;
  }

  console.log("Scheduler stopped");
}

/**
 * Scan for repositories needing snapshot (initial or rescan) and queue jobs
 */
async function scanAndQueuePending(): Promise<void> {
  console.log("Scanning for repositories needing snapshot...");

  try {
    const pending = await findRepositoriesForRescan(RESCAN_INTERVAL_MS);

    if (pending.length === 0) {
      console.log("No repositories need scanning");
      return;
    }

    const initialCount = pending.filter((p) => !p.isRescan).length;
    const rescanCount = pending.filter((p) => p.isRescan).length;
    console.log(
      `Found ${pending.length} repositories (${initialCount} initial, ${rescanCount} rescan)`
    );

    const queue = getSnapshotQueue();

    for (const item of pending) {
      const jobId = `${item.app_id}-${item.repository_id}`;

      // Check if job already exists and is still active
      const existingJob = await queue.getJob(jobId);
      if (existingJob) {
        const state = await existingJob.getState();

        // Only skip if job is actively being processed or waiting
        if (state === "waiting" || state === "active" || state === "delayed") {
          console.log(`Job ${jobId} is ${state}, skipping`);
          continue;
        }

        // Remove stale completed/failed jobs to allow re-queuing
        console.log(`Removing stale ${state} job ${jobId}`);
        await existingJob.remove();
      }

      const jobData: SnapshotJobData = {
        app_id: item.app_id,
        repository_id: item.repository_id,
        github_url: item.github_url,
        owner: item.owner,
        name: item.name,
        base_url: item.base_url,
        github_token_encrypted: item.github_token_encrypted,
        client_auth_key_encrypted: item.client_auth_key_encrypted,
        isRescan: item.isRescan,
      };

      await queue.add("snapshot", jobData, { jobId });
      console.log(
        `Queued ${item.isRescan ? "rescan" : "initial"} job: ${jobId}`
      );
    }
  } catch (err) {
    console.error("Error scanning for repositories:", err);
  }
}
