/**
    ┌───────────────┬─────────────────────────────────────────┐
    │    Status     │                 Action                  │
    ├───────────────┼─────────────────────────────────────────┤
    │ 2xx           │ Success, continue to next file          │
    ├───────────────┼─────────────────────────────────────────┤
    │ Any error     │ Stop immediately, retry entire job      │
    │ (4xx/5xx/net) │ with backoff until MAX_RETRY_ATTEMPTS   │
    └───────────────┴─────────────────────────────────────────┘
   */

import axios, { AxiosError } from "axios";
import type { ScannedFile, ContentEncoding } from "./scanner.js";
import { generateSignedHeaders } from "../utils/signature.js";
import type { ChunkInfo } from "../utils/chunking.js";

// ============================================================================
// Types
// ============================================================================

export interface RepositoryInfo {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
}

export interface NotificationResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  shouldRetry: boolean;
}

/** Endpoint types for granular notifications */
export type NotificationEndpoint = "create" | "update" | "delete";

/** File data in notification payload */
export interface FilePayloadData {
  path: string;
  sha: string;
  size?: number;
  content?: string;
  content_encoding?: ContentEncoding;
  chunk?: ChunkInfo;
}

/** Payload for file create/update notifications */
export interface FileNotificationPayload {
  repository: RepositoryInfo;
  file: FilePayloadData;
  previous_sha?: string; // Only for updates
  commit_sha: string;
  timestamp: string;
}

// ============================================================================
// Granular File Notifications (NEW)
// ============================================================================

/**
 * Send a file notification to a specific endpoint (create/update/delete)
 * Uses HMAC signature authentication (no Bearer token)
 */
export async function sendFileNotification(
  baseUrl: string,
  endpoint: NotificationEndpoint,
  payload: FileNotificationPayload,
  appId: string,
  clientAuthKey: string,
  appName?: string
): Promise<NotificationResult> {
  const url = `${baseUrl}/${endpoint}`;

  try {
    const headers = generateSignedHeaders(appId, payload, clientAuthKey);

    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    const statusCode = response.status;

    const logPrefix = appName ? `[${appName}-${appId}]` : `[${appId}]`;
    const repoName = `${payload.repository.owner}/${payload.repository.name}`;
    const filePath = payload.file.path;

    if (statusCode >= 200 && statusCode < 300) {
      console.log(
        `${logPrefix} File notification sent successfully: ${repoName} - ${filePath} -> ${url}`
      );
      return { success: true, statusCode, shouldRetry: false };
    }

    // All non-2xx errors are treated the same: retry the entire job
    console.error(
      `${logPrefix} Notification failed: ${repoName} - ${filePath} -> ${url}: HTTP ${statusCode}`
    );
    return {
      success: false,
      statusCode,
      error: `HTTP ${statusCode}`,
      shouldRetry: true,
    };
  } catch (err) {
    const error = err as AxiosError;
    const message = error.message || "Unknown error";
    const logPrefix = appName ? `[${appName}-${appId}]` : `[${appId}]`;
    const repoName = `${payload.repository.owner}/${payload.repository.name}`;
    const filePath = payload.file.path;

    console.error(
      `${logPrefix} Failed to send notification: ${repoName} - ${filePath} -> ${url}: ${message}`
    );

    return {
      success: false,
      error: message,
      shouldRetry: true,
    };
  }
}

/**
 * Build file data object with encoding info
 */
function buildFileData(file: ScannedFile): FilePayloadData {
  const data: FilePayloadData = {
    path: file.path,
    sha: file.sha,
    size: file.size,
    content: file.content,
  };

  // Only include content_encoding for binary files (backward compatible)
  if (file.isBinary) {
    data.content_encoding = file.contentEncoding;
  }

  return data;
}

/**
 * Build payload for create notification
 */
export function buildCreatePayload(
  repository: RepositoryInfo,
  file: ScannedFile,
  commitSha: string
): FileNotificationPayload {
  return {
    repository,
    file: buildFileData(file),
    commit_sha: commitSha,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build payload for update notification
 */
export function buildUpdatePayload(
  repository: RepositoryInfo,
  file: ScannedFile,
  previousSha: string,
  commitSha: string
): FileNotificationPayload {
  return {
    repository,
    file: buildFileData(file),
    previous_sha: previousSha,
    commit_sha: commitSha,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build payload for delete notification
 */
export function buildDeletePayload(
  repository: RepositoryInfo,
  path: string,
  previousSha: string,
  commitSha: string
): FileNotificationPayload {
  return {
    repository,
    file: {
      path,
      sha: previousSha,
    },
    commit_sha: commitSha,
    timestamp: new Date().toISOString(),
  };
}
