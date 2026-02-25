import type {
  AppSummary,
  AppDetail,
  QueueStatus,
  QueueJob,
  FailedNotification,
  OverviewMetrics,
  PaginatedResponse,
  RetryResponse,
  BulkRetryResponse,
  BulkProgressResponse,
  ApiResponse,
  ApiErrorResponse,
  DeleteAppResult,
} from "@docora/shared-types";

export interface ListQueryOptions {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: string;
  search?: string;
}

function buildQueryString(
  params: ListQueryOptions & { status?: string }
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v!))}`).join("&");
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`/admin${endpoint}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: "Unknown error",
    }))) as ApiErrorResponse;
    throw new ApiError(errorData.error, response.status);
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data.data;
}

async function postApi<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`/admin${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: "Unknown error",
    }))) as ApiErrorResponse;
    throw new ApiError(errorData.error, response.status);
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data.data;
}

async function deleteApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`/admin${endpoint}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: "Unknown error",
    }))) as ApiErrorResponse;
    throw new ApiError(errorData.error, response.status);
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data.data;
}

export async function retryNotification(
  appId: string,
  repositoryId: string
): Promise<RetryResponse> {
  return postApi<RetryResponse>("/api/retry", {
    app_id: appId,
    repository_id: repositoryId,
  });
}

export async function fetchOverview(): Promise<OverviewMetrics> {
  return fetchApi<OverviewMetrics>("/api/overview");
}

export async function fetchApps(
  params?: ListQueryOptions
): Promise<PaginatedResponse<AppSummary>> {
  const qs = buildQueryString(params ?? {});
  return fetchApi<PaginatedResponse<AppSummary>>(`/api/apps${qs}`);
}

export async function fetchAppDetail(appId: string): Promise<AppDetail> {
  return fetchApi<AppDetail>(`/api/apps/${appId}`);
}

export async function fetchQueue(): Promise<{
  status: QueueStatus;
  jobs: QueueJob[];
}> {
  return fetchApi<{ status: QueueStatus; jobs: QueueJob[] }>("/api/queue");
}

export async function fetchFailedNotifications(
  params?: ListQueryOptions
): Promise<PaginatedResponse<FailedNotification>> {
  const qs = buildQueryString(params ?? {});
  return fetchApi<PaginatedResponse<FailedNotification>>(`/api/notifications/failed${qs}`);
}

export async function bulkRetryByApp(
  appId: string
): Promise<BulkRetryResponse> {
  return postApi<BulkRetryResponse>(`/api/retry/app/${appId}`, {});
}

export async function bulkRetryAll(): Promise<BulkRetryResponse> {
  return postApi<BulkRetryResponse>("/api/retry/all", {});
}

export async function fetchRetryProgress(
  operationId: string
): Promise<BulkProgressResponse> {
  return fetchApi<BulkProgressResponse>(
    `/api/retry/progress/${operationId}`
  );
}

export async function cancelRetry(operationId: string): Promise<void> {
  await postApi<{ message: string }>(
    `/api/retry/cancel/${operationId}`,
    {}
  );
}

export async function resyncRepository(
  appId: string,
  repositoryId: string
): Promise<RetryResponse> {
  return postApi<RetryResponse>("/api/resync", {
    app_id: appId,
    repository_id: repositoryId,
  });
}

export async function resyncByApp(
  appId: string
): Promise<BulkRetryResponse> {
  return postApi<BulkRetryResponse>(`/api/resync/app/${appId}`, {});
}

export async function deleteApp(appId: string): Promise<DeleteAppResult> {
  return deleteApi<DeleteAppResult>(`/api/apps/${appId}`);
}

export { ApiError };
