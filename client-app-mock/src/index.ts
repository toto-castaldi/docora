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

// Legacy bulk payload (deprecated)
interface DocoraPayload {
  event: "initial_snapshot" | "update";
  repository: Repository;
  snapshot: Snapshot;
}

// Milestone 05: Granular notification payloads
interface FileInfo {
  path: string;
  sha: string;
  size?: number;
  content?: string;
}

interface CreatePayload {
  repository: Repository;
  file: FileInfo;
  commit_sha: string;
  timestamp: string;
}

interface UpdatePayload {
  repository: Repository;
  file: FileInfo;
  previous_sha: string;
  commit_sha: string;
  timestamp: string;
}

interface DeletePayload {
  repository: Repository;
  file: { path: string; sha: string };
  commit_sha: string;
  timestamp: string;
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

// Helper to log HMAC headers
function logHmacHeaders(request: { headers: Record<string, unknown> }) {
  console.log("  HMAC Headers:");
  console.log(`    X-Docora-App-Id: ${request.headers["x-docora-app-id"]}`);
  console.log(`    X-Docora-Signature: ${request.headers["x-docora-signature"]}`);
  console.log(`    X-Docora-Timestamp: ${request.headers["x-docora-timestamp"]}`);
}

// Milestone 05: Granular notification endpoints

// POST /create - New file detected
fastify.post<{ Body: CreatePayload }>("/create", async (request) => {
  const { repository, file, commit_sha, timestamp } = request.body;

  console.log("\n" + "=".repeat(60));
  console.log("📄 CREATE - New file detected");
  console.log("=".repeat(60));
  logHmacHeaders(request);
  console.log("-".repeat(60));
  console.log(`  Repository: ${repository.github_url}`);
  console.log(`  Commit: ${commit_sha}`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log("-".repeat(60));
  console.log(`  File: ${file.path}`);
  console.log(`  SHA: ${file.sha}`);
  console.log(`  Size: ${file.size} bytes`);
  if (file.content) {
    const preview = file.content.length > 100
      ? file.content.substring(0, 100) + "..."
      : file.content;
    console.log(`  Content: ${preview.replace(/\n/g, "\\n")}`);
  }
  console.log("=".repeat(60) + "\n");

  return { received: true, event: "create", timestamp: new Date().toISOString() };
});

// POST /update - File modified
fastify.post<{ Body: UpdatePayload }>("/update", async (request) => {
  const { repository, file, previous_sha, commit_sha, timestamp } = request.body;

  console.log("\n" + "=".repeat(60));
  console.log("✏️  UPDATE - File modified");
  console.log("=".repeat(60));
  logHmacHeaders(request);
  console.log("-".repeat(60));
  console.log(`  Repository: ${repository.github_url}`);
  console.log(`  Commit: ${commit_sha}`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log("-".repeat(60));
  console.log(`  File: ${file.path}`);
  console.log(`  Previous SHA: ${previous_sha}`);
  console.log(`  New SHA: ${file.sha}`);
  console.log(`  Size: ${file.size} bytes`);
  if (file.content) {
    const preview = file.content.length > 100
      ? file.content.substring(0, 100) + "..."
      : file.content;
    console.log(`  Content: ${preview.replace(/\n/g, "\\n")}`);
  }
  console.log("=".repeat(60) + "\n");

  return { received: true, event: "update", timestamp: new Date().toISOString() };
});

// POST /delete - File removed
fastify.post<{ Body: DeletePayload }>("/delete", async (request) => {
  const { repository, file, commit_sha, timestamp } = request.body;

  console.log("\n" + "=".repeat(60));
  console.log("🗑️  DELETE - File removed");
  console.log("=".repeat(60));
  logHmacHeaders(request);
  console.log("-".repeat(60));
  console.log(`  Repository: ${repository.github_url}`);
  console.log(`  Commit: ${commit_sha}`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log("-".repeat(60));
  console.log(`  File: ${file.path}`);
  console.log(`  SHA: ${file.sha}`);
  console.log("=".repeat(60) + "\n");

  return { received: true, event: "delete", timestamp: new Date().toISOString() };
});

// Alias: /webhooks/* endpoints (when base_url includes /webhooks)
fastify.post<{ Body: CreatePayload }>("/webhooks/create", async (request) => {
  return fastify.inject({ method: "POST", url: "/create", payload: request.body, headers: request.headers as Record<string, string> })
    .then((res) => JSON.parse(res.payload));
});

fastify.post<{ Body: UpdatePayload }>("/webhooks/update", async (request) => {
  return fastify.inject({ method: "POST", url: "/update", payload: request.body, headers: request.headers as Record<string, string> })
    .then((res) => JSON.parse(res.payload));
});

fastify.post<{ Body: DeletePayload }>("/webhooks/delete", async (request) => {
  return fastify.inject({ method: "POST", url: "/delete", payload: request.body, headers: request.headers as Record<string, string> })
    .then((res) => JSON.parse(res.payload));
});

// Legacy: Main webhook endpoint - receives Docora bulk updates (deprecated)
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
    console.log("-".repeat(60));
    console.log("  Granular endpoints (Milestone 05):");
    console.log(`    POST /create           POST /webhooks/create`);
    console.log(`    POST /update           POST /webhooks/update`);
    console.log(`    POST /delete           POST /webhooks/delete`);
    console.log("-".repeat(60));
    console.log("  Legacy endpoints (deprecated):");
    console.log(`    POST /        - Bulk snapshot`);
    console.log(`    POST /webhooks`);
    console.log("-".repeat(60));
    console.log(`  Health: GET /health`);
    console.log("=".repeat(60));
    console.log("  Waiting for Docora updates...\n");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
