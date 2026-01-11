import { randomUUID } from "crypto";

/**
 * Environment configuration for chunking.
 * Default threshold: 1MB, default chunk size: 512KB
 */
const CHUNK_THRESHOLD_BYTES = parseInt(
  process.env.BINARY_CHUNK_THRESHOLD_BYTES || "1048576",
  10
);

const CHUNK_SIZE_BYTES = parseInt(
  process.env.BINARY_CHUNK_SIZE_BYTES || "524288",
  10
);

export interface ChunkInfo {
  id: string;
  index: number;
  total: number;
}

export interface ContentChunk {
  content: string;
  chunk: ChunkInfo;
}

/**
 * Check if content needs to be chunked based on size threshold.
 *
 * @param sizeBytes - Size in bytes of the original file
 * @returns True if file should be chunked
 */
export function shouldChunk(sizeBytes: number): boolean {
  return sizeBytes > CHUNK_THRESHOLD_BYTES;
}

/**
 * Get the configured chunk threshold in bytes.
 */
export function getChunkThreshold(): number {
  return CHUNK_THRESHOLD_BYTES;
}

/**
 * Get the configured chunk size in bytes.
 */
export function getChunkSize(): number {
  return CHUNK_SIZE_BYTES;
}

/**
 * Split content into chunks for transmission.
 * Each chunk includes metadata for reassembly.
 *
 * @param content - The content string to chunk (typically Base64)
 * @returns Array of chunks with metadata
 */
export function createChunks(content: string): ContentChunk[] {
  const chunkId = randomUUID();
  const totalChunks = Math.ceil(content.length / CHUNK_SIZE_BYTES);

  const chunks: ContentChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, content.length);
    const chunkContent = content.slice(start, end);

    chunks.push({
      content: chunkContent,
      chunk: {
        id: chunkId,
        index: i,
        total: totalChunks,
      },
    });
  }

  return chunks;
}
