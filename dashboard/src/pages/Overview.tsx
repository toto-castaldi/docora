import { formatDistanceToNow } from "date-fns";
import {
  RefreshCw,
  Boxes,
  GitBranch,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { usePollingQuery } from "../hooks/usePolling";
import { fetchOverview } from "../api/admin";
import styles from "./Overview.module.css";

export function Overview() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } =
    usePollingQuery(["overview"], fetchOverview);

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={24} className={styles.spin} />
        <span style={{ marginLeft: "0.5rem" }}>Loading dashboard...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={32} className={styles.errorIcon} />
        <p className={styles.errorMessage}>Failed to load dashboard metrics</p>
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
        <h1 className={styles.title}>Overview</h1>
        <div className={styles.refreshInfo}>
          <span>Updated {lastUpdated}</span>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className={styles.refreshButton}
          >
            <RefreshCw size={14} className={isFetching ? styles.spin : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>
            <Boxes
              size={16}
              style={{ marginRight: "0.5rem", verticalAlign: "text-bottom" }}
            />
            Registered Apps
          </p>
          <p className={styles.metricValue}>{data?.total_apps ?? 0}</p>
        </div>

        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>
            <GitBranch
              size={16}
              style={{ marginRight: "0.5rem", verticalAlign: "text-bottom" }}
            />
            Monitored Repositories
          </p>
          <p className={styles.metricValue}>{data?.total_repositories ?? 0}</p>
        </div>

        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>
            <AlertCircle
              size={16}
              style={{ marginRight: "0.5rem", verticalAlign: "text-bottom" }}
            />
            Failed Notifications
          </p>
          <p
            className={`${styles.metricValue} ${(data?.failed_notifications ?? 0) > 0 ? styles.metricValueError : ""}`}
          >
            {data?.failed_notifications ?? 0}
          </p>
        </div>

        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>
            <Clock
              size={16}
              style={{ marginRight: "0.5rem", verticalAlign: "text-bottom" }}
            />
            Queue (Waiting / Active)
          </p>
          <p className={styles.metricValue}>
            {data?.queue_waiting ?? 0} / {data?.queue_active ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
}
