import { useState, useMemo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  RefreshCcw,
  Loader2,
  Check,
  X,
  Clock,
  Zap,
  RotateCw,
} from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { RepositorySummary, RetryResponse } from "@docora/shared-types";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { FilterBar } from "../components/FilterBar";
import { FilterChips } from "../components/FilterChips";
import type { Column } from "../components/DataTable";
import type { FilterConfig } from "../components/FilterBar";
import styles from "./AppDetail.module.css";

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

interface Props {
  repositories: RepositorySummary[];
  retryMutation: UseMutationResult<RetryResponse, Error, { repositoryId: string }>;
  resyncMutation: UseMutationResult<RetryResponse, Error, { repositoryId: string }>;
  onResyncRepo: (repositoryId: string, repoName: string) => void;
}

function filterRepos(repos: RepositorySummary[], search: string, status: string): RepositorySummary[] {
  return repos.filter((r) => {
    if (status && r.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      return `${r.owner}/${r.name}`.toLowerCase().includes(q);
    }
    return true;
  });
}

function sortRepos(repos: RepositorySummary[], sortBy: string, sortOrder: "asc" | "desc"): RepositorySummary[] {
  if (!sortBy) return repos;
  const sorted = [...repos].sort((a, b) => {
    if (sortBy === "name") return `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`);
    if (sortBy === "status") return a.status.localeCompare(b.status);
    if (sortBy === "last_scanned_at") {
      const at = a.last_scanned_at ? new Date(a.last_scanned_at).getTime() : -Infinity;
      const bt = b.last_scanned_at ? new Date(b.last_scanned_at).getTime() : -Infinity;
      return at - bt;
    }
    return 0;
  });
  return sortOrder === "desc" ? sorted.reverse() : sorted;
}

export function AppDetailRepoTable({ repositories, retryMutation, resyncMutation, onResyncRepo }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const filtered = useMemo(() => filterRepos(repositories, searchTerm, statusFilter), [repositories, searchTerm, statusFilter]);
  const sorted = useMemo(() => sortRepos(filtered, sortBy, sortOrder), [filtered, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / limit));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => sorted.slice((safePage - 1) * limit, safePage * limit), [sorted, safePage, limit]);

  const handleSort = useCallback((key: string) => {
    if (key !== sortBy) { setSortBy(key); setSortOrder("asc"); }
    else if (sortOrder === "asc") setSortOrder("desc");
    else { setSortBy(""); setSortOrder("asc"); }
    setPage(1);
  }, [sortBy, sortOrder]);

  const handleFilterChange = useCallback((_key: string, value: string | null) => {
    setStatusFilter(value ?? "");
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  const clearAll = useCallback(() => { setSearchTerm(""); setStatusFilter(""); setPage(1); }, []);
  const hasFilters = !!searchTerm || !!statusFilter;

  const chips = useMemo(() => {
    const c: { key: string; label: string; value: string }[] = [];
    if (searchTerm) c.push({ key: "search", label: "Search", value: searchTerm });
    if (statusFilter) c.push({ key: "status", label: "Status", value: statusFilter });
    return c;
  }, [searchTerm, statusFilter]);

  const handleRemoveChip = useCallback((key: string) => {
    if (key === "search") setSearchTerm("");
    if (key === "status") setStatusFilter("");
    setPage(1);
  }, []);

  const columns: Column<RepositorySummary>[] = useMemo(() => [
    {
      key: "name", label: "Repository", sortable: true,
      render: (r) => (
        <>
          <a href={r.github_url} target="_blank" rel="noopener noreferrer" className={styles.repoLink}>
            {r.owner}/{r.name}
          </a>
          {r.circuit_open && <span className={styles.circuitBadge}>Circuit Open</span>}
        </>
      ),
    },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "last_scanned_at", label: "Last Scanned", sortable: true,
      render: (r) => r.last_scanned_at ? formatDistanceToNow(new Date(r.last_scanned_at), { addSuffix: true }) : "Never",
    },
    {
      key: "actions", label: "Actions", sortable: false,
      render: (r) => (
        <div className={styles.actionsCell}>
          {r.status === "failed" && (
            <button className={styles.retryButton} disabled={retryMutation.isPending} onClick={() => retryMutation.mutate({ repositoryId: r.repository_id })}>
              {retryMutation.isPending ? <Loader2 size={14} className={styles.spin} /> : <RotateCw size={14} />}
              Retry
            </button>
          )}
          <button className={styles.resyncButton} disabled={resyncMutation.isPending} onClick={() => onResyncRepo(r.repository_id, `${r.owner}/${r.name}`)}>
            {resyncMutation.isPending ? <Loader2 size={14} className={styles.spin} /> : <RefreshCcw size={14} />}
            Re-sync
          </button>
        </div>
      ),
    },
  ], [retryMutation, resyncMutation, onResyncRepo]);

  if (repositories.length === 0) {
    return (
      <div className={styles.emptyRepos}>
        <p>No repositories linked to this app yet.</p>
      </div>
    );
  }

  return (
    <>
      <FilterBar
        search={searchTerm}
        onSearchChange={handleSearchChange}
        filters={[STATUS_FILTER]}
        filterValues={{ status: statusFilter }}
        onFilterChange={handleFilterChange}
      />
      <FilterChips chips={chips} onRemove={handleRemoveChip} onClearAll={clearAll} />
      {sorted.length === 0 && hasFilters ? (
        <div className={styles.emptyRepos}>
          <p>No results match your filters.</p>
          <button className={styles.refreshButton} onClick={clearAll}>Clear filters</button>
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={paginated} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} rowKey={(r) => r.repository_id} />
          {totalPages > 1 && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={repositories.length}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={handleLimitChange}
              filteredTotal={sorted.length !== repositories.length ? sorted.length : undefined}
            />
          )}
        </>
      )}
    </>
  );
}
