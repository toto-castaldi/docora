import "dotenv/config";
import Fastify from "fastify";
import { createHash } from "crypto";

// Types matching Docora's payload structure
interface Repository {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
}

// Milestone 07: Binary file support
interface ChunkInfo {
  id: string;
  index: number;
  total: number;
}

interface FileInfo {
  path: string;
  sha: string;
  size?: number;
  content?: string;
  content_encoding?: "plain" | "base64";
  chunk?: ChunkInfo;
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

// Chunk storage for reassembly
interface ChunkTransfer {
  chunks: (string | undefined)[];
  received: number;
  total: number;
  path: string;
  sha: string;
  size: number;
  startTime: number;
}

const chunkTransfers = new Map<string, ChunkTransfer>();
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const fastify = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
    },
  },
});

// Cleanup expired transfers periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, transfer] of chunkTransfers.entries()) {
    if (now - transfer.startTime > CHUNK_TIMEOUT_MS) {
      console.log(`⚠️  Chunk transfer ${id} expired (${transfer.path})`);
      chunkTransfers.delete(id);
    }
  }
}, 60000);

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

// Helper to log file info
function logFileInfo(file: FileInfo, isBinary: boolean) {
  console.log(`  File: ${file.path}`);
  console.log(`  SHA: ${file.sha}`);
  console.log(`  Size: ${file.size} bytes`);

  if (isBinary) {
    console.log(`  Encoding: ${file.content_encoding} (BINARY)`);
    if (file.content) {
      console.log(`  Base64 length: ${file.content.length} chars`);
    }
  } else if (file.content) {
    const preview = file.content.length > 100
      ? file.content.substring(0, 100) + "..."
      : file.content;
    console.log(`  Content: ${preview.replace(/\n/g, "\\n")}`);
  }
}

// Handle chunk reception and reassembly
function handleChunk(file: FileInfo): { complete: boolean; fullContent?: Buffer } {
  const chunk = file.chunk!;

  if (!chunkTransfers.has(chunk.id)) {
    chunkTransfers.set(chunk.id, {
      chunks: new Array(chunk.total),
      received: 0,
      total: chunk.total,
      path: file.path,
      sha: file.sha,
      size: file.size || 0,
      startTime: Date.now(),
    });
  }

  const transfer = chunkTransfers.get(chunk.id)!;
  transfer.chunks[chunk.index] = file.content;
  transfer.received++;

  console.log(`  📦 Chunk ${chunk.index + 1}/${chunk.total} (ID: ${chunk.id.slice(0, 8)}...)`);

  if (transfer.received === transfer.total) {
    // All chunks received - reassemble
    const fullBase64 = transfer.chunks.join("");
    const fullContent = Buffer.from(fullBase64, "base64");

    // Verify SHA
    const computedSha = createHash("sha256").update(fullContent).digest("hex");
    const shaMatch = computedSha === file.sha;

    console.log("  ✅ All chunks received - reassembling...");
    console.log(`  📊 Total size: ${fullContent.length} bytes`);
    console.log(`  🔐 SHA verification: ${shaMatch ? "PASS ✓" : "FAIL ✗"}`);

    if (!shaMatch) {
      console.log(`     Expected: ${file.sha}`);
      console.log(`     Got:      ${computedSha}`);
    }

    chunkTransfers.delete(chunk.id);
    return { complete: true, fullContent };
  }

  return { complete: false };
}

// POST /create - New file detected
fastify.post<{ Body: CreatePayload }>("/create", async (request) => {
  const { repository, file, commit_sha, timestamp } = request.body;
  const isBinary = file.content_encoding === "base64";
  const isChunked = !!file.chunk;

  console.log("\n" + "=".repeat(60));
  console.log(`📄 CREATE - New file detected ${isBinary ? "🖼️ BINARY" : ""} ${isChunked ? "📦 CHUNKED" : ""}`);
  console.log("=".repeat(60));
  logHmacHeaders(request);
  console.log("-".repeat(60));
  console.log(`  Repository: ${repository.github_url}`);
  console.log(`  Commit: ${commit_sha}`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log("-".repeat(60));

  if (isChunked) {
    const result = handleChunk(file);
    if (result.complete) {
      console.log("  🎉 Binary file completely received!");
    }
  } else {
    logFileInfo(file, isBinary);
  }

  console.log("=".repeat(60) + "\n");
  return { received: true, event: "create", timestamp: new Date().toISOString() };
});

// POST /update - File modified
fastify.post<{ Body: UpdatePayload }>("/update", async (request) => {
  const { repository, file, previous_sha, commit_sha, timestamp } = request.body;
  const isBinary = file.content_encoding === "base64";
  const isChunked = !!file.chunk;

  console.log("\n" + "=".repeat(60));
  console.log(`✏️  UPDATE - File modified ${isBinary ? "🖼️ BINARY" : ""} ${isChunked ? "📦 CHUNKED" : ""}`);
  console.log("=".repeat(60));
  logHmacHeaders(request);
  console.log("-".repeat(60));
  console.log(`  Repository: ${repository.github_url}`);
  console.log(`  Commit: ${commit_sha}`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log("-".repeat(60));
  console.log(`  Previous SHA: ${previous_sha}`);

  if (isChunked) {
    const result = handleChunk(file);
    if (result.complete) {
      console.log("  🎉 Binary file completely received!");
    }
  } else {
    logFileInfo(file, isBinary);
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

// Aliases for /webhooks/* paths
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

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log("\n" + "=".repeat(60));
    console.log("  DOCORA CLIENT MOCK (Milestone 07)");
    console.log("=".repeat(60));
    console.log(`  Listening on: http://${HOST}:${PORT}`);
    console.log("-".repeat(60));
    console.log("  Endpoints:");
    console.log(`    POST /create     POST /webhooks/create`);
    console.log(`    POST /update     POST /webhooks/update`);
    console.log(`    POST /delete     POST /webhooks/delete`);
    console.log("-".repeat(60));
    console.log("  Features:");
    console.log("    ✓ Text files (plain content)");
    console.log("    ✓ Binary files (Base64 encoded)");
    console.log("    ✓ Chunked transfer (auto-reassembly)");
    console.log("    ✓ SHA verification on reassembly");
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
