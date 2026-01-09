/**
    ┌───────────────┬─────────────────────────────────────────┐
    │    Status     │                 Action                  │
    ├───────────────┼─────────────────────────────────────────┤
    │ 2xx           │ Success, mark as synced                 │
    ├───────────────┼─────────────────────────────────────────┤
    │ 4xx           │ Client error, mark as failed (no retry) │
    ├───────────────┼─────────────────────────────────────────┤
    │ 5xx           │ Server error, retry with backoff        │
    ├───────────────┼─────────────────────────────────────────┤
    │ Network error │ Retry with backoff                      │
    └───────────────┴─────────────────────────────────────────┘
   */

import axios, { AxiosError } from "axios";
import type { ScannedFile } from "./scanner.js";
import { generateSignedHeaders } from "../utils/signature.js";

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

/** Payload for file create/update notifications */
export interface FileNotificationPayload {
  repository: RepositoryInfo;
  file: {
    path: string;
    sha: string;
    size?: number;
    content?: string;
  };
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
  clientAuthKey: string
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

    if (statusCode >= 200 && statusCode < 300) {
      console.log(`File notification sent successfully to ${url}`);
      return { success: true, statusCode, shouldRetry: false };
    }

    if (statusCode >= 400 && statusCode < 500) {
      console.error(`Client error from ${url}: ${statusCode}`);
      return {
        success: false,
        statusCode,
        error: `Client error: ${statusCode}`,
        shouldRetry: false,
      };
    }

    console.error(`Server error from ${url}: ${statusCode}`);
    return {
      success: false,
      statusCode,
      error: `Server error: ${statusCode}`,
      shouldRetry: true,
    };
  } catch (err) {
    const error = err as AxiosError;
    const message = error.message || "Unknown error";

    console.error(`Failed to send notification to ${url}: ${message}`);

    return {
      success: false,
      error: message,
      shouldRetry: true,
    };
  }
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
    file: {
      path: file.path,
      sha: file.sha,
      size: file.size,
      content: file.content,
    },
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
    file: {
      path: file.path,
      sha: file.sha,
      size: file.size,
      content: file.content,
    },
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
