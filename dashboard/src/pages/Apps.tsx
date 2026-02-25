import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Loader2, Boxes, Trash2 } from "lucide-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTableParams } from "../hooks/useTableParams.js";
import { useDeleteApp } from "../hooks/useDeleteApp.js";
import { DataTable } from "../components/DataTable.js";
import type { Column } from "../components/DataTable.js";
import { Pagination } from "../components/Pagination.js";
import { FilterBar } from "../components/FilterBar.js";
import { FilterChips } from "../components/FilterChips.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { fetchApps } from "../api/admin.js";
import type { AppSummary } from "@docora/shared-types";
import styles from "./Apps.module.css";

function useAppsColumns(
  onDeleteRequest: (appId: string, appName: string) => void
): Column<AppSummary>[] {
  return [
    {
      key: "app_name",
      label: "App Name",
      sortable: true,
      render: (app) => (
        <Link to={`/apps/${app.app_id}`} className={styles.appLink}>
          {app.app_name}
        </Link>
      ),
    },
    {
      key: "base_url",
      label: "URL",
      sortable: false,
      render: (app) => (
        <span title={app.base_url} className={styles.urlCell}>
          {app.base_url}
        </span>
      ),
    },
    {
      key: "repository_count",
      label: "Repositories",
      sortable: true,
      render: (app) => app.repository_count,
    },
    {
      key: "failed_notification_count",
      label: "Failed",
      sortable: true,
      render: (app) =>
        app.failed_notification_count > 0 ? (
          <span className={styles.failedCount}>
            {app.failed_notification_count}
          </span>
        ) : (
          0
        ),
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      render: (app) =>
        formatDistanceToNow(new Date(app.created_at), { addSuffix: true }),
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (app) => (
        <button
          className={styles.deleteButton}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest(app.app_id, app.app_name);
          }}
          title="Delete app"
        >
          <Trash2 size={16} />
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

export function Apps() {
  const {
    page, limit, sortBy, sortOrder, search,
    updateParams, clearAllFilters,
  } = useTableParams({ sortBy: "created_at", sortOrder: "desc" });

  const { data, isLoading, isPlaceholderData, dataUpdatedAt, refetch, isFetching } =
    useQuery({
      queryKey: ["apps", page, limit, sortBy, sortOrder, search],
      queryFn: () =>
        fetchApps({ page, limit, sort_by: sortBy, sort_order: sortOrder, search }),
      placeholderData: keepPreviousData,
      refetchInterval: 10_000,
    });

  const deleteAction = useDeleteApp();
  const columns = useAppsColumns((appId, appName) => deleteAction.requestDelete(appId, appName));
  const apps = data?.data ?? [];
  const pagination = data?.pagination;
  const hasFilters = !!search;

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
        <span style={{ marginLeft: "0.5rem" }}>Loading apps...</span>
      </div>
    );
  }

  const lastUpdated = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "never";

  if (apps.length === 0 && !hasFilters) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Registered Apps</h1>
        </div>
        <div className={styles.emptyState}>
          <Boxes size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
          <p className={styles.emptyTitle}>No apps registered</p>
          <p className={styles.emptyText}>
            Apps will appear here once clients register via the API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Registered Apps</h1>
        <div className={styles.refreshInfo}>
          <span>Updated {lastUpdated}</span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={styles.refreshButton}
          >
            <RefreshCw size={14} className={isFetching ? styles.spin : ""} />
            Refresh
          </button>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(v) => updateParams({ search: v || null })}
      />
      <FilterChips
        chips={buildChips(search)}
        onRemove={handleChipRemove}
        onClearAll={clearAllFilters}
      />

      {apps.length === 0 && hasFilters ? (
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
          data={apps}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          rowKey={(app) => app.app_id}
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
        open={!!deleteAction.pendingDelete}
        title="Delete App"
        message={
          deleteAction.pendingDelete ? (
            <>
              This will permanently delete <strong>{deleteAction.pendingDelete.appName}</strong> along with{" "}
              {deleteAction.pendingDelete.repositoryCount} repositories,{" "}
              {deleteAction.pendingDelete.snapshotCount} snapshots, and{" "}
              {deleteAction.pendingDelete.deliveryCount} deliveries.
            </>
          ) : ""
        }
        confirmLabel="Delete permanently"
        variant="danger"
        loading={deleteAction.isPending}
        onConfirm={deleteAction.confirmDelete}
        onCancel={deleteAction.cancelDelete}
      />
    </div>
  );
}
