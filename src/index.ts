import "dotenv/config";
import { buildServer } from "./server.js";
import { initDatabase, closeDatabase } from "./db/index.js";
import { createSnapshotWorker } from "./workers/snapshot.worker.js";
import { startScheduler, stopScheduler } from "./workers/snapshot.scheduler.js";
import { closeRedisConnection } from "./queue/connection.js";

type RunMode = "api" | "worker" | "all";

const RUN_MODE = (process.env.RUN_MODE || "all") as RunMode;
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

let isShuttingDown = false;

async function main(): Promise<void> {
  console.log(`Starting Docora in '${RUN_MODE}' mode...`);

  // Initialize database
  await initDatabase();
  console.log("Database initialized");

  let server: Awaited<ReturnType<typeof buildServer>> | null = null;
  let worker: ReturnType<typeof createSnapshotWorker> | null = null;

  // Start API server
  if (RUN_MODE === "api" || RUN_MODE === "all") {
    server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    console.log(`API server listening on http://${HOST}:${PORT}`);
  }

  // Start worker and scheduler
  if (RUN_MODE === "worker" || RUN_MODE === "all") {
    worker = createSnapshotWorker();
    startScheduler();
    console.log("Worker and scheduler started");
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      console.log("Shutdown already in progress...");
      return;
    }
    isShuttingDown = true;

    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      // Stop scheduler
      if (RUN_MODE === "worker" || RUN_MODE === "all") {
        await stopScheduler();
        console.log("Scheduler stopped");
      }

      // Close worker
      if (worker) {
        await worker.close();
        console.log("Worker stopped");
      }

      // Close API server
      if (server) {
        await server.close();
        console.log("API server stopped");
      }

      // Close connections
      if (RUN_MODE === "worker" || RUN_MODE === "all") {
        await closeRedisConnection();
        console.log("Redis connection closed");
      }

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
}

main().catch((err) => {
  console.error("Docora failed to start:", err);
  process.exit(1);
});
