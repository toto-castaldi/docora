/**
 * Chunked file notification service.
 * Handles splitting large files into chunks and sending them sequentially.
 */

import type { ScannedFile } from "./scanner.js";
import {
  sendFileNotification,
  buildCreatePayload,
  buildUpdatePayload,
  type RepositoryInfo,
  type NotificationEndpoint,
  type FileNotificationPayload,
} from "./notifier.js";
import { shouldChunk, createChunks } from "../utils/chunking.js";

export interface ChunkedNotificationResult {
  success: boolean;
  chunksTotal: number;
  chunksSent: number;
  error?: string;
  shouldRetry: boolean;
}

/**
 * Send a file notification, automatically chunking if needed.
 * For large files, sends chunks sequentially waiting for 2xx before next.
 */
export async function sendFileWithChunking(
  baseUrl: string,
  endpoint: NotificationEndpoint,
  repository: RepositoryInfo,
  file: ScannedFile,
  commitSha: string,
  appId: string,
  clientAuthKey: string,
  previousSha?: string,
  appName?: string
): Promise<ChunkedNotificationResult> {
  // Build the base payload
  const payload =
    endpoint === "update" && previousSha
      ? buildUpdatePayload(repository, file, previousSha, commitSha)
      : buildCreatePayload(repository, file, commitSha);

  // Check if chunking is needed (only for binary files above threshold)
  if (!file.isBinary || !shouldChunk(file.size)) {
    const result = await sendFileNotification(
      baseUrl,
      endpoint,
      payload,
      appId,
      clientAuthKey,
      appName
    );

    return {
      success: result.success,
      chunksTotal: 1,
      chunksSent: result.success ? 1 : 0,
      error: result.error,
      shouldRetry: result.shouldRetry,
    };
  }

  // Chunk the content and send sequentially
  return sendChunkedPayload(
    baseUrl,
    endpoint,
    payload,
    appId,
    clientAuthKey,
    appName
  );
}

/**
 * Send a payload in chunks sequentially.
 */
async function sendChunkedPayload(
  baseUrl: string,
  endpoint: NotificationEndpoint,
  basePayload: FileNotificationPayload,
  appId: string,
  clientAuthKey: string,
  appName?: string
): Promise<ChunkedNotificationResult> {
  const content = basePayload.file.content || "";
  const chunks = createChunks(content);
  const totalChunks = chunks.length;
  const logPrefix = appName ? `[${appName}-${appId}]` : `[${appId}]`;

  console.log(
    `${logPrefix} Sending ${basePayload.file.path} in ${totalChunks} chunks`
  );

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const chunkPayload: FileNotificationPayload = {
      ...basePayload,
      file: {
        ...basePayload.file,
        content: chunk.content,
        chunk: chunk.chunk,
      },
    };

    const result = await sendFileNotification(
      baseUrl,
      endpoint,
      chunkPayload,
      appId,
      clientAuthKey,
      appName
    );

    if (!result.success) {
      console.error(
        `${logPrefix} Chunk ${i + 1}/${totalChunks} failed for ${basePayload.file.path}`
      );

      return {
        success: false,
        chunksTotal: totalChunks,
        chunksSent: i,
        error: result.error,
        shouldRetry: result.shouldRetry,
      };
    }

    console.log(
      `${logPrefix} Chunk ${i + 1}/${totalChunks} sent for ${basePayload.file.path}`
    );
  }

  console.log(`${logPrefix} All ${totalChunks} chunks sent for ${basePayload.file.path}`);

  return {
    success: true,
    chunksTotal: totalChunks,
    chunksSent: totalChunks,
    shouldRetry: false,
  };
}
