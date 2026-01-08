export * from "./apps.js";
export * from "./repositories.js";

import type { AppsTable } from "./apps.js";
import type {
  RepositoriesTable,
  AppRepositoriesTable,
  RepositorySnapshotsTable,
  SnapshotFilesTable,
} from "./repositories.js";

export interface Database {
  apps: AppsTable;
  repositories: RepositoriesTable;
  app_repositories: AppRepositoriesTable;
  repository_snapshots: RepositorySnapshotsTable;
  snapshot_files: SnapshotFilesTable;
}
