import {
  unlinkAppFromRepository,
  isRepositoryOrphan,
  deleteRepository,
} from "../repositories/repositories.js";
import { clearDeliveries } from "../repositories/deliveries.js";
import { deleteLocalRepository } from "./git.js";
import { withRepoLock } from "./repo-lock.js";

export interface UnwatchResult {
  success: boolean;
  wasOrphan: boolean;
}

/**
 * Unwatch a repository for an app.
 * Handles all cleanup: unlink, clear deliveries, orphan check, delete if needed.
 *
 * @returns UnwatchResult with success=false if link didn't exist
 */
export async function unwatchRepository(
  appId: string,
  repositoryId: string
): Promise<UnwatchResult> {
  // Unlink app from repository (returns repo info if existed)
  const repoInfo = await unlinkAppFromRepository(appId, repositoryId);

  if (!repoInfo) {
    return { success: false, wasOrphan: false };
  }

  // Clear delivery records for this app-repository pair
  await clearDeliveries(appId, repositoryId);

  // Check if repository is now orphan (no other apps watching)
  const orphan = await isRepositoryOrphan(repositoryId);

  if (orphan) {
    // Delete repository from database (DB ops stay outside the lock)
    await deleteRepository(repositoryId);

    // Delete local clone (filesystem op protected by per-repo lock)
    await withRepoLock(
      `${repoInfo.owner}/${repoInfo.name}`,
      `unwatch-${appId}`,
      async () => {
        deleteLocalRepository(repoInfo.owner, repoInfo.name);
      }
    );
  }

  return { success: true, wasOrphan: orphan };
}
