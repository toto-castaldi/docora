import type { Generated } from "kysely";

export interface AppDeliveredFilesTable {
  app_id: string;
  repository_id: string;
  file_path: string;
  file_sha: string;
  delivered_at: Generated<Date>;
}
