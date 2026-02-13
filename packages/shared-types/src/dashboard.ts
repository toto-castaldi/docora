/** App summary for list view */
export interface AppSummary {
  app_id: string;
  app_name: string;
  base_url: string;
  created_at: string;
  repository_count: number;
  failed_notification_count: number;
}

/** Repository summary for list view */
export interface RepositorySummary {
  repository_id: string;
  github_url: string;
  owner: string;
  name: string;
  status: "pending_snapshot" | "scanning" | "synced" | "failed";
  last_scanned_at: string | null;
  circuit_open: boolean;
  app_id?: string;
}

/** App detail with related data */
export interface AppDetail extends AppSummary {
  email: string;
  website: string | null;
  description: string | null;
  repositories: RepositorySummary[];
}

/** Failed notification entry */
export interface FailedNotification {
  app_id: string;
  app_name: string;
  repository_id: string;
  repository_name: string;
  github_url: string;
  error_message: string;
  timestamp: string;
  retry_count: number;
}

/** BullMQ queue status */
export interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/** Queue job summary */
export interface QueueJob {
  id: string;
  name: string;
  app_name: string;
  repository_name: string;
  status: "waiting" | "active" | "delayed";
  created_at: string;
  processed_on: string | null;
}

/** Overview metrics for dashboard home */
export interface OverviewMetrics {
  total_apps: number;
  total_repositories: number;
  failed_notifications: number;
  queue_waiting: number;
  queue_active: number;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/** Query params accepted by list endpoints */
export interface ListQueryParams {
  page?: string;
  limit?: string;
  sort_by?: string;
  sort_order?: string;
  search?: string;
}

/** API response wrapper */
export interface ApiResponse<T> {
  data: T;
}

/** API error response */
export interface ApiErrorResponse {
  error: string;
}

/** Single retry request body */
export interface RetryRequest {
  app_id: string;
  repository_id: string;
}

/** Single retry success response */
export interface RetryResponse {
  message: string;
  job_id: string;
}

/** Bulk retry response (used by bulk operations) */
export interface BulkRetryResponse {
  message: string;
  operation_id: string;
  total: number;
}

/** Progress polling response for bulk operations */
export interface BulkProgressResponse {
  operation_id: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
}

/** Single re-sync request body */
export interface ResyncRequest {
  app_id: string;
  repository_id: string;
}
