export * from "./apps.js";
export * from "./repositories.js";
export * from "./deliveries.js";

import type { AppsTable } from "./apps.js";
import type {
  RepositoriesTable,
  AppRepositoriesTable,
  RepositorySnapshotsTable,
  SnapshotFilesTable,
} from "./repositories.js";
import type { AppDeliveredFilesTable } from "./deliveries.js";

export interface Database {
  apps: AppsTable;
  repositories: RepositoriesTable;
  app_repositories: AppRepositoriesTable;
  repository_snapshots: RepositorySnapshotsTable;
  snapshot_files: SnapshotFilesTable;
  app_delivered_files: AppDeliveredFilesTable;
}
