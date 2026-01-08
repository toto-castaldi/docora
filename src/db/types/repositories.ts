import type { Generated } from "kysely";

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
}
