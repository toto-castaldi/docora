import { useState, useMemo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Loader2, Zap, Clock, Pause, AlertCircle } from "lucide-react";
import { usePollingQuery } from "../hooks/usePolling";
import { fetchQueue } from "../api/admin";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { FilterChips } from "../components/FilterChips";
import type { Column } from "../components/DataTable";
import type { FilterConfig } from "../components/FilterBar";
import type { QueueJob } from "@docora/shared-types";
import styles from "./Queue.module.css";

const STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  waiting: 1,
  delayed: 2,
};

const STATUS_FILTER: FilterConfig = {
  key: "status",
  label: "Status",
  options: [
    { value: "active", label: "Active" },
    { value: "waiting", label: "Waiting" },
    { value: "delayed", label: "Delayed" },
  ],
};

function JobStatusBadge({ status }: { status: QueueJob["status"] }) {
  const config = {
    active: { icon: Zap, className: styles.jobActive, label: "Active" },
    waiting: { icon: Clock, className: styles.jobWaiting, label: "Waiting" },
    delayed: { icon: Pause, className: styles.jobDelayed, label: "Delayed" },
  };
  const { icon: Icon, className, label } = config[status];
  return (
    <span className={`${styles.jobStatusBadge} ${className}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

function buildColumns(): Column<QueueJob>[] {
  return [
    { key: "repository_name", label: "Repository", sortable: true, render: (j) => j.repository_name },
    { key: "app_name", label: "App", sortable: true, render: (j) => j.app_name },
    { key: "status", label: "Status", sortable: true, render: (j) => <JobStatusBadge status={j.status} /> },
    {
      key: "created_at", label: "Created", sortable: true,
      render: (j) => formatDistanceToNow(new Date(j.created_at), { addSuffix: true }),
    },
  ];
}

function filterJobs(jobs: QueueJob[], search: string, status: string): QueueJob[] {
  return jobs.filter((job) => {
    if (status && job.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      return job.app_name.toLowerCase().includes(q) || job.repository_name.toLowerCase().includes(q);
    }
    return true;
  });
}

function sortJobs(jobs: QueueJob[], sortBy: string, sortOrder: "asc" | "desc"): QueueJob[] {
  if (!sortBy) return jobs;
  const sorted = [...jobs].sort((a, b) => {
    if (sortBy === "status") return (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9);
    if (sortBy === "created_at") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    const av = String((a as unknown as Record<string, unknown>)[sortBy] ?? "");
    const bv = String((b as unknown as Record<string, unknown>)[sortBy] ?? "");
    return av.localeCompare(bv);
  });
  return sortOrder === "desc" ? sorted.reverse() : sorted;
}

export function Queue() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } =
    usePollingQuery(["queue"], fetchQueue);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const columns = useMemo(buildColumns, []);
  const jobs = data?.jobs ?? [];
  const status = data?.status;

  const filtered = useMemo(() => filterJobs(jobs, searchTerm, statusFilter), [jobs, searchTerm, statusFilter]);
  const sorted = useMemo(() => sortJobs(filtered, sortBy, sortOrder), [filtered, sortBy, sortOrder]);

  const handleSort = useCallback((key: string) => {
    if (key !== sortBy) { setSortBy(key); setSortOrder("asc"); }
    else if (sortOrder === "asc") setSortOrder("desc");
    else { setSortBy(""); setSortOrder("desc"); }
  }, [sortBy, sortOrder]);

  const handleFilterChange = useCallback((_key: string, value: string | null) => {
    setStatusFilter(value ?? "");
  }, []);

  const clearAll = useCallback(() => { setSearchTerm(""); setStatusFilter(""); }, []);
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
  }, []);

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={24} className={styles.spin} />
        <span style={{ marginLeft: "0.5rem" }}>Loading queue status...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={32} className={styles.errorIcon} />
        <p className={styles.errorMessage}>Failed to load queue status</p>
        <button onClick={() => refetch()} className={styles.retryButton}>
          Try again
        </button>
      </div>
    );
  }

  const lastUpdated = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "never";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Job Queue</h1>
        <div className={styles.refreshInfo}>
          <span>Updated {lastUpdated}</span>
          <button onClick={() => refetch()} disabled={isFetching} className={styles.refreshButton}>
            <RefreshCw size={14} className={isFetching ? styles.spin : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.statusGrid}>
        {(["active", "waiting", "delayed", "completed", "failed"] as const).map((s) => (
          <div key={s} className={styles.statusCard}>
            <p className={styles.statusLabel}>{s.charAt(0).toUpperCase() + s.slice(1)}</p>
            <p className={`${styles.statusValue} ${styles[`status${s.charAt(0).toUpperCase() + s.slice(1)}` as keyof typeof styles]}`}>
              {status?.[s] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Current Jobs</h2>
        <FilterBar
          search={searchTerm}
          onSearchChange={setSearchTerm}
          filters={[STATUS_FILTER]}
          filterValues={{ status: statusFilter }}
          onFilterChange={handleFilterChange}
        />
        <FilterChips chips={chips} onRemove={handleRemoveChip} onClearAll={clearAll} />
        {sorted.length === 0 && hasFilters ? (
          <div className={styles.emptyJobs}>
            <p>No jobs match your filters.</p>
            <button className={styles.refreshButton} onClick={clearAll}>Clear filters</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.emptyJobs}>
            <p>No active or waiting jobs in the queue.</p>
          </div>
        ) : (
          <DataTable columns={columns} data={sorted} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} rowKey={(j) => j.id} />
        )}
      </div>
    </div>
  );
}
