import { useState } from "react";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { RefreshCw, Loader2, CheckCircle, RotateCcw, RotateCw } from "lucide-react";
import { useTableParams } from "../hooks/useTableParams.js";
import { DataTable } from "../components/DataTable.js";
import type { Column } from "../components/DataTable.js";
import { Pagination } from "../components/Pagination.js";
import { FilterBar } from "../components/FilterBar.js";
import { FilterChips } from "../components/FilterChips.js";
import { fetchFailedNotifications, retryNotification, bulkRetryAll } from "../api/admin.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { BulkProgress } from "../components/BulkProgress.js";
import type { FailedNotification } from "@docora/shared-types";
import styles from "./Notifications.module.css";

function useNotificationColumns(
  onRetry: (appId: string, repoId: string) => void,
  isPending: boolean
): Column<FailedNotification>[] {
  return [
    {
      key: "repository_name",
      label: "Repository",
      sortable: true,
      render: (n) => (
        <a href={n.github_url} target="_blank" rel="noopener noreferrer" className={styles.repoLink}>
          {n.repository_name}
        </a>
      ),
    },
    {
      key: "app_name",
      label: "App",
      sortable: true,
      render: (n) => (
        <Link to={`/apps/${n.app_id}`} className={styles.appLink}>
          {n.app_name}
        </Link>
      ),
    },
    {
      key: "error_message",
      label: "Error",
      sortable: false,
      render: (n) => (
        <span className={styles.errorCell} title={n.error_message}>
          {n.error_message}
        </span>
      ),
    },
    {
      key: "retry_count",
      label: "Retries",
      sortable: true,
      render: (n) => (
        <span className={styles.retryBadge}>
          <RotateCcw size={12} />
          {n.retry_count}
        </span>
      ),
    },
    {
      key: "last_scanned_at",
      label: "Time",
      sortable: true,
      render: (n) => formatDistanceToNow(new Date(n.timestamp), { addSuffix: true }),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (n) => (
        <button
          className={styles.retryButton}
          disabled={isPending}
          onClick={() => onRetry(n.app_id, n.repository_id)}
        >
          {isPending ? <Loader2 size={14} className={styles.spin} /> : <RotateCw size={14} />}
          Retry
        </button>
      ),
    },
  ];
}

function buildChips(search: string) {
  const chips: { key: string; label: string; value: string }[] = [];
  if (search) chips.push({ key: "search", label: "Search", value: search });
  return chips;
}

export function Notifications() {
  const { page, limit, sortBy, sortOrder, search, updateParams, clearAllFilters } =
    useTableParams({ sortBy: "last_scanned_at", sortOrder: "desc" });

  const { data, isLoading, isPlaceholderData, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["notifications", "failed", page, limit, sortBy, sortOrder, search],
    queryFn: () =>
      fetchFailedNotifications({ page, limit, sort_by: sortBy, sort_order: sortOrder, search }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  const [showConfirm, setShowConfirm] = useState(false);
  const [bulkOperationId, setBulkOperationId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: ({ appId, repositoryId }: { appId: string; repositoryId: string }) =>
      retryNotification(appId, repositoryId),
    onSuccess: () => {
      toast.success("Retry queued successfully");
      queryClient.invalidateQueries({ queryKey: ["notifications", "failed"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to queue retry"),
  });

  const columns = useNotificationColumns(
    (appId, repoId) => retryMutation.mutate({ appId, repositoryId: repoId }),
    retryMutation.isPending
  );

  const notifications = data?.data ?? [];
  const pagination = data?.pagination;
  const totalCount = pagination?.total ?? 0;
  const hasFilters = !!search;

  async function handleBulkRetryAll() {
    setShowConfirm(false);
    try {
      const result = await bulkRetryAll();
      setBulkOperationId(result.operation_id);
      toast.success(`Retrying ${result.total} failed notifications...`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to start bulk retry");
    }
  }

  function handleBulkComplete() {
    setBulkOperationId(null);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  }

  function handleBulkCancel() {
    setBulkOperationId(null);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  function handleSort(columnKey: string) {
    if (columnKey !== sortBy) {
      updateParams({ sort_by: columnKey, sort_order: "asc" });
    } else if (sortOrder === "asc") {
      updateParams({ sort_order: "desc" });
    } else {
      updateParams({ sort_by: null, sort_order: null });
    }
  }

  function handleChipRemove(key: string) {
    updateParams({ [key]: null });
  }

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={24} className={styles.spin} />
        <span style={{ marginLeft: "0.5rem" }}>Loading notifications...</span>
      </div>
    );
  }

  const lastUpdated = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "never";

  if (notifications.length === 0 && !hasFilters) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Failed Notifications</h1>
        </div>
        <div className={styles.emptyState}>
          <CheckCircle size={48} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>All notifications delivered</p>
          <p className={styles.emptyText}>
            No failed notifications. Everything is working correctly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Failed Notifications</h1>
        <div className={styles.refreshInfo}>
          {totalCount > 0 && !bulkOperationId && (
            <button onClick={() => setShowConfirm(true)} className={styles.bulkRetryButton}>
              <RotateCw size={14} />
              Retry All ({totalCount})
            </button>
          )}
          <span>Updated {lastUpdated}</span>
          <button onClick={() => refetch()} disabled={isFetching} className={styles.refreshButton}>
            <RefreshCw size={14} className={isFetching ? styles.spin : ""} />
            Refresh
          </button>
        </div>
      </div>

      {bulkOperationId && (
        <BulkProgress
          operationId={bulkOperationId}
          onComplete={handleBulkComplete}
          onCancel={handleBulkCancel}
        />
      )}

      <FilterBar
        search={search}
        onSearchChange={(v) => updateParams({ search: v || null })}
      />
      <FilterChips
        chips={buildChips(search)}
        onRemove={handleChipRemove}
        onClearAll={clearAllFilters}
      />

      {notifications.length === 0 && hasFilters ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No results match your filters</p>
          <p className={styles.emptyText}>
            <button className={styles.clearButton} onClick={clearAllFilters}>
              Clear all filters
            </button>
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={notifications}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          rowKey={(n) => `${n.app_id}-${n.repository_id}`}
          isLoading={isPlaceholderData}
        />
      )}

      {pagination && pagination.total_pages > 0 && (
        <Pagination
          page={page}
          totalPages={pagination.total_pages}
          total={pagination.total}
          limit={limit}
          onPageChange={(p) => updateParams({ page: String(p) })}
          onLimitChange={(l) => updateParams({ limit: String(l) })}
        />
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Retry All Failed Notifications"
        message={`This will retry all ${totalCount} failed notifications across all apps. Continue?`}
        confirmLabel="Retry All"
        variant="warning"
        onConfirm={handleBulkRetryAll}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
