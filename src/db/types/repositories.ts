import type { Generated } from "kysely";

export type AppRepositoryStatus =
    | 'pending_snapshot'
    | 'scanning'
    | 'synced'
    | 'failed';

export interface RepositoriesTable {
  id: Generated<string>;
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  is_private: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AppRepositoriesTable {
  id: Generated<string>;
  app_id: string;
  repository_id: string;
  github_token_encrypted: string | null;
  created_at: Generated<Date>;
  status: Generated<AppRepositoryStatus>; // default: 'pending_snapshot'
  retry_count: Generated<number>; // default: 0
  last_error: string | null;
  last_scanned_at: Date | null;
}

export interface RepositorySnapshotsTable {
  id: Generated<string>;
  repository_id: string;
  commit_sha: string;
  branch: Generated<string>; // default: 'main'
  scanned_at: Generated<Date>;
}

export interface SnapshotFilesTable {
  id: Generated<string>;
  snapshot_id: string;
  path: string;
  sha: string;
  size: number;
  created_at: Generated<Date>;
}
