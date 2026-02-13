import { Queue } from "bullmq";
import { getRedisUrl, getRedisOptions } from "../queue/connection.js";
import {
  SNAPSHOT_QUEUE_NAME,
  type SnapshotJobData,
} from "../workers/snapshot.worker.js";

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueJobInfo {
  id: string;
  name: string;
  app_name: string;
  repository_name: string;
  status: "waiting" | "active" | "delayed";
  created_at: string;
  processed_on: string | null;
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
 * Get queue job counts by status
 */
export async function getQueueStatus(): Promise<QueueCounts> {
  const q = getQueue();
  const counts = await q.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed"
  );
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

/**
 * Get list of waiting and active jobs
 */
export async function getQueueJobs(limit: number = 50): Promise<QueueJobInfo[]> {
  const q = getQueue();

  const [waitingJobs, activeJobs, delayedJobs] = await Promise.all([
    q.getWaiting(0, limit),
    q.getActive(0, limit),
    q.getDelayed(0, limit),
  ]);

  const mapJob = (
    job: Awaited<ReturnType<typeof q.getWaiting>>[number],
    status: QueueJobInfo["status"]
  ): QueueJobInfo => ({
    id: job.id ?? "unknown",
    name: job.name,
    app_name: job.data.app_name,
    repository_name: `${job.data.owner}/${job.data.name}`,
    status,
    created_at: new Date(job.timestamp).toISOString(),
    processed_on: job.processedOn
      ? new Date(job.processedOn).toISOString()
      : null,
  });

  return [
    ...activeJobs.map((j) => mapJob(j, "active")),
    ...waitingJobs.map((j) => mapJob(j, "waiting")),
    ...delayedJobs.map((j) => mapJob(j, "delayed")),
  ];
}

/**
 * Clean up queue connection
 */
export async function closeQueueConnection(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
