import "dotenv/config";
import Fastify from "fastify";

// Types matching Docora's payload structure
interface SnapshotFile {
  path: string;
  sha: string;
  size: number;
  content: string;
}

interface Repository {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
}

interface Snapshot {
  commit_sha: string;
  branch: string;
  scanned_at: string;
  files: SnapshotFile[];
}

interface DocoraPayload {
  event: "initial_snapshot" | "update";
  repository: Repository;
  snapshot: Snapshot;
}

const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const fastify = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

// Health check
fastify.get("/health", async () => {
  return { status: "healthy", timestamp: new Date().toISOString() };
});

// Main webhook endpoint - receives Docora updates
fastify.post<{ Body: DocoraPayload }>("/", async (request, reply) => {
  const payload = request.body;

  console.log("\n" + "=".repeat(60));
  console.log(`RECEIVED: ${payload.event}`);
  console.log("=".repeat(60));
  console.log(`Repository: ${payload.repository.github_url}`);
  console.log(`Repository ID: ${payload.repository.repository_id}`);
  console.log(`Owner: ${payload.repository.owner}`);
  console.log(`Name: ${payload.repository.name}`);
  console.log("-".repeat(60));
  console.log(`Commit SHA: ${payload.snapshot.commit_sha}`);
  console.log(`Branch: ${payload.snapshot.branch}`);
  console.log(`Scanned at: ${payload.snapshot.scanned_at}`);
  console.log(`Files count: ${payload.snapshot.files.length}`);
  console.log("-".repeat(60));

  // Log each file (truncate content for readability)
  for (const file of payload.snapshot.files) {
    const contentPreview =
      file.content.length > 100
        ? file.content.substring(0, 100) + "..."
        : file.content;
    console.log(`  ${file.path}`);
    console.log(`    SHA: ${file.sha}`);
    console.log(`    Size: ${file.size} bytes`);
    console.log(`    Content: ${contentPreview.replace(/\n/g, "\\n")}`);
  }

  console.log("=".repeat(60) + "\n");

  return { received: true, event: payload.event, timestamp: new Date().toISOString() };
});

// Alternative webhook path
fastify.post<{ Body: DocoraPayload }>("/webhooks", async (request, reply) => {
  // Delegate to main handler
  return fastify.inject({
    method: "POST",
    url: "/",
    payload: request.body,
  }).then((res) => {
    reply.status(res.statusCode);
    return JSON.parse(res.payload);
  });
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log("\n" + "=".repeat(60));
    console.log("  DOCORA CLIENT MOCK");
    console.log("=".repeat(60));
    console.log(`  Listening on: http://${HOST}:${PORT}`);
    console.log(`  Webhook URL:  http://${HOST}:${PORT}/`);
    console.log(`  Health:       http://${HOST}:${PORT}/health`);
    console.log("=".repeat(60));
    console.log("  Waiting for Docora updates...\n");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
