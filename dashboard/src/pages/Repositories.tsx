import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { RefreshCw, RefreshCcw, Loader2, GitBranch, Check, X, Clock, Zap } from "lucide-react";
import { useTableParams } from "../hooks/useTableParams.js";
import { DataTable } from "../components/DataTable.js";
import type { Column } from "../components/DataTable.js";
import { Pagination } from "../components/Pagination.js";
import { FilterBar } from "../components/FilterBar.js";
import type { FilterConfig } from "../components/FilterBar.js";
import { FilterChips } from "../components/FilterChips.js";
import { fetchRepositories, resyncRepository } from "../api/admin.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import type { RepositorySummary } from "@docora/shared-types";
import styles from "./Repositories.module.css";

function StatusBadge({ status }: { status: RepositorySummary["status"] }) {
  const config = {
    synced: { icon: Check, className: styles.statusSynced, label: "Synced" },
    failed: { icon: X, className: styles.statusFailed, label: "Failed" },
    pending_snapshot: { icon: Clock, className: styles.statusPending, label: "Pending" },
    scanning: { icon: Zap, className: styles.statusScanning, label: "Scanning" },
  };
  const { icon: Icon, className, label } = config[status];
  return (
    <span className={`${styles.statusBadge} ${className}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

const STATUS_FILTER: FilterConfig = {
  key: "status",
  label: "Status",
  options: [
    { value: "synced", label: "Synced" },
    { value: "failed", label: "Failed" },
    { value: "pending_snapshot", label: "Pending" },
    { value: "scanning", label: "Scanning" },
  ],
};

function useRepoColumns(
  onResync: (appId: string, repoId: string, name: string) => void,
  isPending: boolean
): Column<RepositorySummary>[] {
  return [
    {
      key: "name",
      label: "Repository",
      sortable: true,
      render: (repo) => (
        <>
          <a href={repo.github_url} target="_blank" rel="noopener noreferrer" className={styles.repoLink}>
            {repo.owner}/{repo.name}
          </a>
          {repo.circuit_open && <span className={styles.circuitBadge}>Circuit Open</span>}
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (repo) => <StatusBadge status={repo.status} />,
    },
    {
      key: "last_scanned_at",
      label: "Last Scanned",
      sortable: true,
      render: (repo) =>
        repo.last_scanned_at
          ? formatDistanceToNow(new Date(repo.last_scanned_at), { addSuffix: true })
          : "Never",
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (repo) =>
        repo.app_id ? (
          <button
            className={styles.resyncButton}
            disabled={isPending}
            onClick={() => onResync(repo.app_id!, repo.repository_id, `${repo.owner}/${repo.name}`)}
          >
            {isPending ? <Loader2 size={14} className={styles.spin} /> : <RefreshCcw size={14} />}
            Re-sync
          </button>
        ) : null,
    },
  ];
}

function buildChips(search: string, status: string) {
  const chips: { key: string; label: string; value: string }[] = [];
  if (search) chips.push({ key: "search", label: "Search", value: search });
  if (status) {
    const opt = STATUS_FILTER.options.find((o) => o.value === status);
    chips.push({ key: "status", label: "Status", value: opt?.label ?? status });
  }
  return chips;
}

export function Repositories() {
  const { page, limit, sortBy, sortOrder, search, updateParams, getFilter, setFilter, clearAllFilters } =
    useTableParams({ sortBy: "created_at", sortOrder: "desc" });

  const status = getFilter("status");

  const { data, isLoading, isPlaceholderData, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["repositories", page, limit, sortBy, sortOrder, search, status],
    queryFn: () => fetchRepositories({ page, limit, sort_by: sortBy, sort_order: sortOrder, search, status }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  const queryClient = useQueryClient();
  const [pendingResync, setPendingResync] = useState<{
    appId: string; repositoryId: string; repoName: string;
  } | null>(null);

  const resyncMutation = useMutation({
    mutationFn: ({ appId, repositoryId }: { appId: string; repositoryId: string }) =>
      resyncRepository(appId, repositoryId),
    onSuccess: () => {
      toast.success("Re-sync queued");
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to queue re-sync"),
  });

  const columns = useRepoColumns(
    (appId, repoId, name) => setPendingResync({ appId, repositoryId: repoId, repoName: name }),
    resyncMutation.isPending
  );

  const repos = data?.data ?? [];
  const pagination = data?.pagination;
  const hasFilters = !!search || !!status;

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
    if (key === "status") {
      setFilter("status", null);
    } else {
      updateParams({ [key]: null });
    }
  }

  function confirmResync() {
    if (pendingResync) {
      resyncMutation.mutate({ appId: pendingResync.appId, repositoryId: pendingResync.repositoryId });
      setPendingResync(null);
    }
  }

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={24} className={styles.spin} />
        <span style={{ marginLeft: "0.5rem" }}>Loading repositories...</span>
      </div>
    );
  }

  const lastUpdated = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "never";

  if (repos.length === 0 && !hasFilters) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>All Repositories</h1>
        </div>
        <div className={styles.emptyState}>
          <GitBranch size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
          <p className={styles.emptyTitle}>No repositories</p>
          <p className={styles.emptyText}>
            Repositories will appear here once apps register them via the API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>All Repositories</h1>
        <div className={styles.refreshInfo}>
          <span>Updated {lastUpdated}</span>
          <button onClick={() => refetch()} disabled={isFetching} className={styles.refreshButton}>
            <RefreshCw size={14} className={isFetching ? styles.spin : ""} />
            Refresh
          </button>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[STATUS_FILTER]}
        filterValues={{ status }}
        onFilterChange={(key, value) => setFilter(key, value)}
      />
      <FilterChips chips={buildChips(search, status)} onRemove={handleChipRemove} onClearAll={clearAllFilters} />

      {repos.length === 0 && hasFilters ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No results match your filters</p>
          <p className={styles.emptyText}>
            <button className={styles.clearButton} onClick={clearAllFilters}>Clear all filters</button>
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={repos}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          rowKey={(repo) => repo.repository_id}
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
        open={!!pendingResync}
        title="Re-sync Repository"
        message={`This will re-sync ${pendingResync?.repoName ?? ""} and re-send ALL files to the client app. This may trigger many notifications. Continue?`}
        confirmLabel="Re-sync"
        variant="danger"
        onConfirm={confirmResync}
        onCancel={() => setPendingResync(null)}
      />
    </div>
  );
}
