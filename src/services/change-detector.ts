/**
    ┌─────────────────┬────────────────────────────────────────────┐
    │   Change Type   │              Detection Logic               │
    ├─────────────────┼────────────────────────────────────────────┤
    │ created         │ Path in current but NOT in previous        │
    ├─────────────────┼────────────────────────────────────────────┤
    │ updated         │ Path in both, but SHA differs              │
    ├─────────────────┼────────────────────────────────────────────┤
    │ deleted         │ Path in previous but NOT in current        │
    └─────────────────┴────────────────────────────────────────────┘

    Processing order: deleted → created → updated
   */

import type { ScannedFile } from "./scanner.js";

export type ChangeType = "created" | "updated" | "deleted";

export interface FileChange {
  type: ChangeType;
  path: string;
  currentFile?: ScannedFile; // Present for created/updated
  previousSha?: string; // Present for updated/deleted
}

/**
 * Detect changes between current scan and previous snapshot
 *
 * @param currentFiles - Files from current repository scan
 * @param previousFiles - Map of path → sha from previous snapshot
 * @returns Array of detected changes (unsorted)
 */
export function detectChanges(
  currentFiles: ScannedFile[],
  previousFiles: Map<string, string>
): FileChange[] {
  const changes: FileChange[] = [];
  const currentMap = new Map(currentFiles.map((f) => [f.path, f]));

  // Detect deleted files (in previous but not in current)
  for (const [path, sha] of previousFiles) {
    if (!currentMap.has(path)) {
      changes.push({
        type: "deleted",
        path,
        previousSha: sha,
      });
    }
  }

  // Detect created and updated files
  for (const file of currentFiles) {
    const previousSha = previousFiles.get(file.path);

    if (previousSha === undefined) {
      // New file (not in previous snapshot)
      changes.push({
        type: "created",
        path: file.path,
        currentFile: file,
      });
    } else if (previousSha !== file.sha) {
      // Modified file (SHA changed)
      changes.push({
        type: "updated",
        path: file.path,
        currentFile: file,
        previousSha,
      });
    }
    // If SHA matches, file is unchanged - skip
  }

  return changes;
}

/**
 * Sort changes in processing order: deleted → created → updated
 *
 * This order ensures:
 * - Deleted files are removed first (frees up paths for potential renames)
 * - Created files are added next
 * - Updated files are processed last
 */
export function sortChanges(changes: FileChange[]): FileChange[] {
  const order: Record<ChangeType, number> = {
    deleted: 0,
    created: 1,
    updated: 2,
  };

  return [...changes].sort((a, b) => order[a.type] - order[b.type]);
}

/**
 * Detect and sort changes in one call
 */
export function detectAndSortChanges(
  currentFiles: ScannedFile[],
  previousFiles: Map<string, string>
): FileChange[] {
  const changes = detectChanges(currentFiles, previousFiles);
  return sortChanges(changes);
}

/**
 * Check if this is an initial snapshot (no previous files)
 */
export function isInitialSnapshot(previousFiles: Map<string, string>): boolean {
  return previousFiles.size === 0;
}

/**
 * Get changes grouped by type
 */
export function groupChangesByType(changes: FileChange[]): {
  created: FileChange[];
  updated: FileChange[];
  deleted: FileChange[];
} {
  return {
    created: changes.filter((c) => c.type === "created"),
    updated: changes.filter((c) => c.type === "updated"),
    deleted: changes.filter((c) => c.type === "deleted"),
  };
}
