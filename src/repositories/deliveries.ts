/**
 * Repository for tracking file deliveries per app.
 * Each app maintains its own view of what files it has received.
 */

import { getDatabase } from "../db/index.js";

export interface DeliveredFile {
  file_path: string;
  file_sha: string;
  delivered_at: Date;
}

/**
 * Get all delivered files for an app-repository pair.
 * Returns a Map<path, sha> for efficient change detection.
 */
export async function getDeliveredFiles(
  appId: string,
  repositoryId: string
): Promise<Map<string, string>> {
  const db = getDatabase();

  const files = await db
    .selectFrom("app_delivered_files")
    .select(["file_path", "file_sha"])
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .execute();

  const fileMap = new Map<string, string>();
  for (const file of files) {
    fileMap.set(file.file_path, file.file_sha);
  }

  return fileMap;
}

/**
 * Record successful delivery of a single file.
 * Uses upsert to handle re-deliveries (UPDATE operations).
 */
export async function recordDelivery(
  appId: string,
  repositoryId: string,
  filePath: string,
  fileSha: string
): Promise<void> {
  const db = getDatabase();

  await db
    .insertInto("app_delivered_files")
    .values({
      app_id: appId,
      repository_id: repositoryId,
      file_path: filePath,
      file_sha: fileSha,
    })
    .onConflict((oc) =>
      oc.columns(["app_id", "repository_id", "file_path"]).doUpdateSet({
        file_sha: fileSha,
        delivered_at: new Date(),
      })
    )
    .execute();
}

/**
 * Record successful delivery of multiple files (batch).
 * Uses upsert to handle re-deliveries.
 */
export async function recordDeliveries(
  appId: string,
  repositoryId: string,
  files: Array<{ path: string; sha: string }>
): Promise<void> {
  if (files.length === 0) return;

  const db = getDatabase();

  await db
    .insertInto("app_delivered_files")
    .values(
      files.map((file) => ({
        app_id: appId,
        repository_id: repositoryId,
        file_path: file.path,
        file_sha: file.sha,
      }))
    )
    .onConflict((oc) =>
      oc.columns(["app_id", "repository_id", "file_path"]).doUpdateSet({
        file_sha: (eb) => eb.ref("excluded.file_sha"),
        delivered_at: new Date(),
      })
    )
    .execute();
}

/**
 * Remove delivery record for a deleted file.
 */
export async function removeDelivery(
  appId: string,
  repositoryId: string,
  filePath: string
): Promise<void> {
  const db = getDatabase();

  await db
    .deleteFrom("app_delivered_files")
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .where("file_path", "=", filePath)
    .execute();
}

/**
 * Clear all deliveries for an app-repository pair.
 * Useful for forcing a full re-sync.
 */
export async function clearDeliveries(
  appId: string,
  repositoryId: string
): Promise<void> {
  const db = getDatabase();

  await db
    .deleteFrom("app_delivered_files")
    .where("app_id", "=", appId)
    .where("repository_id", "=", repositoryId)
    .execute();

  console.log(`Cleared deliveries for app ${appId} / repo ${repositoryId}`);
}
