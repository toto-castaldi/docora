import axios from "axios";
import { findAppsWatchingRepository } from "../repositories/repositories.js";
import { generateSignedHeaders } from "../utils/signature.js";
import { decryptToken } from "../utils/crypto.js";

// ============================================================================
// Types
// ============================================================================

export interface SyncFailedPayload {
  event: "sync_failed";
  repository: {
    repository_id: string;
    github_url: string;
    owner: string;
    name: string;
  };
  error: {
    type: string;
    message: string;
  };
  circuit_breaker: {
    status: "open";
    consecutive_failures: number;
    threshold: number;
    cooldown_until: string;
  };
  retry_count: number;
  timestamp: string;
}

export interface SyncFailedParams {
  repositoryId: string;
  githubUrl: string;
  owner: string;
  name: string;
  errorMessage: string;
  consecutiveFailures: number;
  threshold: number;
  cooldownUntil: Date;
}

// ============================================================================
// Notification sender
// ============================================================================

/**
 * Send sync_failed webhook to all apps watching a repository.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function sendSyncFailedNotification(
  params: SyncFailedParams
): Promise<void> {
  const apps = await findAppsWatchingRepository(params.repositoryId);

  if (apps.length === 0) {
    console.log(
      `[failure-notifier] No apps watching repository ${params.repositoryId}, skipping`
    );
    return;
  }

  console.log(
    `[failure-notifier] Sending sync_failed to ${apps.length} app(s) for ${params.owner}/${params.name}`
  );

  for (const app of apps) {
    await sendToApp(app, params);
  }
}

/**
 * Send sync_failed notification to a single app.
 * Catches and logs errors — never throws.
 */
async function sendToApp(
  app: {
    app_id: string;
    app_name: string;
    base_url: string;
    client_auth_key_encrypted: string;
    retry_count: number;
  },
  params: SyncFailedParams
): Promise<void> {
  const logPrefix = `[failure-notifier][${app.app_name}-${app.app_id}]`;
  const url = `${app.base_url}/sync_failed`;

  try {
    const clientAuthKey = decryptToken(app.client_auth_key_encrypted);

    const payload: SyncFailedPayload = {
      event: "sync_failed",
      repository: {
        repository_id: params.repositoryId,
        github_url: params.githubUrl,
        owner: params.owner,
        name: params.name,
      },
      error: {
        type: "git_failure",
        message: params.errorMessage,
      },
      circuit_breaker: {
        status: "open",
        consecutive_failures: params.consecutiveFailures,
        threshold: params.threshold,
        cooldown_until: params.cooldownUntil.toISOString(),
      },
      retry_count: app.retry_count,
      timestamp: new Date().toISOString(),
    };

    const headers = generateSignedHeaders(
      app.app_id,
      payload,
      clientAuthKey
    );

    await axios.post(url, payload, {
      headers: { "Content-Type": "application/json", ...headers },
      timeout: 10000,
    });

    console.log(`${logPrefix} sync_failed sent successfully -> ${url}`);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`${logPrefix} Failed to send sync_failed -> ${url}: ${message}`);
  }
}
