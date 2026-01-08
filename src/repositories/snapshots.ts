/**
  ---
  Key Points
  Feature: Upsert
  Implementation: Check existing, update or insert
  ────────────────────────────────────────
  Feature: Transaction
  Implementation: Atomic update of snapshot + files
  ────────────────────────────────────────
  Feature: Cascade delete
  Implementation: Files deleted when snapshot deleted (DB constraint)
  ────────────────────────────────────────
  Feature: No content stored
  Implementation: Only metadata (path, sha, size) - content is in the notification
  ---
 */

import { getDatabase } from "../db/index.js";
import type { ScannedFile } from "../services/scanner.js";

export interface StoredSnapshot {
  id: string;
  repository_id: string;
  commit_sha: string;
  branch: string;
  scanned_at: Date;
  files: StoredSnapshotFile[];
}

export interface StoredSnapshotFile {
  path: string;
  sha: string;
  size: number;
}

/**
 * Save a snapshot (upsert - replaces existing snapshot for repo)
 */
export async function saveSnapshot(
  repositoryId: string,
  commitSha: string,
  branch: string,
  files: ScannedFile[]
): Promise<void> {
  const db = getDatabase();

  await db.transaction().execute(async (trx) => {
    // Check if snapshot exists for this repository
    const existing = await trx
      .selectFrom("repository_snapshots")
      .select("id")
      .where("repository_id", "=", repositoryId)
      .executeTakeFirst();

    let snapshotId: string;

    if (existing) {
      // Update existing snapshot
      await trx
        .updateTable("repository_snapshots")
        .set({
          commit_sha: commitSha,
          branch,
          scanned_at: new Date(),
        })
        .where("id", "=", existing.id)
        .execute();

      snapshotId = existing.id;

      // Delete old files
      await trx
        .deleteFrom("snapshot_files")
        .where("snapshot_id", "=", snapshotId)
        .execute();
    } else {
      // Insert new snapshot
      const result = await trx
        .insertInto("repository_snapshots")
        .values({
          repository_id: repositoryId,
          commit_sha: commitSha,
          branch,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      snapshotId = result.id;
    }

    // Insert files (if any)
    if (files.length > 0) {
      await trx
        .insertInto("snapshot_files")
        .values(
          files.map((file) => ({
            snapshot_id: snapshotId,
            path: file.path,
            sha: file.sha,
            size: file.size,
          }))
        )
        .execute();
    }
  });

  console.log(
    `Saved snapshot for ${repositoryId}: ${commitSha} (${files.length} files)`
  );
}

/**
 * Get the latest snapshot for a repository
 */
export async function getSnapshot(
  repositoryId: string
): Promise<StoredSnapshot | null> {
  const db = getDatabase();

  const snapshot = await db
    .selectFrom("repository_snapshots")
    .selectAll()
    .where("repository_id", "=", repositoryId)
    .executeTakeFirst();

  if (!snapshot) {
    return null;
  }

  const files = await db
    .selectFrom("snapshot_files")
    .select(["path", "sha", "size"])
    .where("snapshot_id", "=", snapshot.id)
    .execute();

  return {
    id: snapshot.id,
    repository_id: snapshot.repository_id,
    commit_sha: snapshot.commit_sha,
    branch: snapshot.branch,
    scanned_at: snapshot.scanned_at,
    files,
  };
}

/**
 * Delete snapshot for a repository
 */
export async function deleteSnapshot(repositoryId: string): Promise<void> {
  const db = getDatabase();

  await db
    .deleteFrom("repository_snapshots")
    .where("repository_id", "=", repositoryId)
    .execute();

  console.log(`Deleted snapshot for ${repositoryId}`);
}
