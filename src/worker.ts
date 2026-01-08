import "dotenv/config";
import { createSnapshotWorker } from "./workers/snapshot.worker.js";
import { startScheduler, stopScheduler } from "./workers/snapshot.scheduler.js";
import { closeRedisConnection } from "./queue/connection.js";
import { closeDatabase, initDatabase } from "./db/index.js";

let isShuttingDown = false;

async function main(): Promise<void> {
  console.log("Starting Docora Worker...");

  // Initialize database
  await initDatabase();
  console.log("Database initialized");

  // Start the worker
  const worker = createSnapshotWorker();

  // Start the scheduler
  startScheduler();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      console.log("Shutdown already in progress...");
      return;
    }
    isShuttingDown = true;

    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      // Stop scheduler first (no new jobs)
      await stopScheduler();
      console.log("Scheduler stopped");

      // Close worker (finish current jobs)
      await worker.close();
      console.log("Worker stopped");

      // Close connections
      await closeRedisConnection();
      console.log("Redis connection closed");

      await closeDatabase();
      console.log("Database connection closed");

      console.log("Shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("Docora Worker is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
