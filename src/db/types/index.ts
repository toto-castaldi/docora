export * from "./apps.js";
export * from "./repositories.js";

import type { AppsTable } from "./apps.js";
import type {
  RepositoriesTable,
  AppRepositoriesTable,
} from "./repositories.js";

export interface Database {
  apps: AppsTable;
  repositories: RepositoriesTable;
  app_repositories: AppRepositoriesTable;
}
