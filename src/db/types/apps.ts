import type { Generated } from "kysely";

export interface AppsTable {
  id: Generated<string>;
  app_id: string;
  token_hash: string;
  app_name: string;
  base_url: string;
  email: string;
  website: string | null;
  description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  client_auth_key_encrypted: string;
}
