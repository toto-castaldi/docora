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

export interface RepositoryInfo {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
}

export interface SnapshotPayload {
  event: "initial_snapshot" | "update";
  repository: RepositoryInfo;
  snapshot: {
    commit_sha: string;
    branch: string;
    scanned_at: string;
    files: ScannedFile[];
  };
}

export interface NotificationResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  shouldRetry: boolean;
}

/**
 * Send a snapshot to the app's endpoint
 */
export async function sendSnapshot(
  baseUrl: string,
  payload: SnapshotPayload
): Promise<NotificationResult> {
  try {
    const response = await axios.post(baseUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
      validateStatus: () => true, // Don't throw on any status
    });

    const statusCode = response.status;

    if (statusCode >= 200 && statusCode < 300) {
      console.log(`Snapshot sent successfully to ${baseUrl}`);
      return { success: true, statusCode, shouldRetry: false };
    }

    if (statusCode >= 400 && statusCode < 500) {
      // Client error - don't retry
      console.error(`Client error from ${baseUrl}: ${statusCode}`);
      return {
        success: false,
        statusCode,
        error: `Client error: ${statusCode}`,
        shouldRetry: false,
      };
    }

    // 5xx - Server error, should retry
    console.error(`Server error from ${baseUrl}: ${statusCode}`);
    return {
      success: false,
      statusCode,
      error: `Server error: ${statusCode}`,
      shouldRetry: true,
    };
  } catch (err) {
    const error = err as AxiosError;
    const message = error.message || "Unknown error";

    console.error(`Failed to send snapshot to ${baseUrl}: ${message}`);

    // Network errors should retry
    return {
      success: false,
      error: message,
      shouldRetry: true,
    };
  }
}

/**
 * Build the snapshot payload
 */
export function buildSnapshotPayload(
  repository: RepositoryInfo,
  commitSha: string,
  branch: string,
  files: ScannedFile[]
): SnapshotPayload {
  return {
    event: "initial_snapshot",
    repository,
    snapshot: {
      commit_sha: commitSha,
      branch,
      scanned_at: new Date().toISOString(),
      files,
    },
  };
}
