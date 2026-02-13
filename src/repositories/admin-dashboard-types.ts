export interface AppWithCounts {
  app_id: string;
  app_name: string;
  base_url: string;
  created_at: Date;
  repository_count: number;
  failed_notification_count: number;
}

export interface AppDetailResult {
  app_id: string;
  app_name: string;
  base_url: string;
  email: string;
  website: string | null;
  description: string | null;
  created_at: Date;
}

export interface RepositoryWithStatus {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  status: string;
  last_scanned_at: Date | null;
  circuit_open: boolean;
  app_id: string;
  app_name: string;
}

export interface FailedNotificationResult {
  app_id: string;
  app_name: string;
  repository_id: string;
  repository_name: string;
  github_url: string;
  error_message: string;
  retry_count: number;
  last_scanned_at: Date | null;
}

export interface ListParams {
  page: number;
  limit: number;
  sort_by: string;
  sort_order: "asc" | "desc";
  search: string;
}

export interface RepoListParams extends ListParams {
  status?: string;
}
