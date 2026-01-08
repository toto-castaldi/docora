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
import { findPendingSnapshots } from "../repositories/repositories.js";
import { SNAPSHOT_QUEUE_NAME, SnapshotJobData } from "./snapshot.worker.js";

const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "60000", 10);
const RETRY_BASE_DELAY_MS = parseInt(
  process.env.RETRY_BASE_DELAY_MS || "1000",
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
 * Scan for pending repositories and queue jobs
 */
async function scanAndQueuePending(): Promise<void> {
  console.log("Scanning for pending snapshots...");

  try {
    const pending = await findPendingSnapshots();

    if (pending.length === 0) {
      console.log("No pending snapshots found");
      return;
    }

    console.log(`Found ${pending.length} pending snapshots`);
    const queue = getSnapshotQueue();

    for (const item of pending) {
      const jobId = `${item.app_id}-${item.repository_id}`;

      // Check if job already exists
      const existingJob = await queue.getJob(jobId);
      if (existingJob) {
        console.log(`Job ${jobId} already queued, skipping`);
        continue;
      }

      const jobData: SnapshotJobData = {
        app_id: item.app_id,
        repository_id: item.repository_id,
        github_url: item.github_url,
        owner: item.owner,
        name: item.name,
        base_url: item.base_url,
        github_token_encrypted: item.github_token_encrypted,
      };

      await queue.add("snapshot", jobData, { jobId });
      console.log(`Queued snapshot job: ${jobId}`);
    }
  } catch (err) {
    console.error("Error scanning for pending snapshots:", err);
  }
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
