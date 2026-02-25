import { Link, useParams, useNavigate } from "react-router";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft,
  RefreshCw,
  RefreshCcw,
  Loader2,
  RotateCw,
  Trash2,
} from "lucide-react";
import { usePollingQuery } from "../hooks/usePolling";
import { useAppActions } from "../hooks/useAppActions";
import { useDeleteApp } from "../hooks/useDeleteApp";
import { fetchAppDetail } from "../api/admin";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BulkProgress } from "../components/BulkProgress";
import { AppDetailRepoTable } from "./AppDetailRepoTable";
import styles from "./AppDetail.module.css";

export function AppDetail() {
  const { appId } = useParams<{ appId: string }>();

  const {
    data: app,
    isLoading,
    dataUpdatedAt,
    refetch,
    isFetching,
    error,
  } = usePollingQuery(["app", appId!], () => fetchAppDetail(appId!), {
    enabled: !!appId,
  });

  const actions = useAppActions(appId!);
  const navigate = useNavigate();
  const deleteAction = useDeleteApp({
    onSuccess: () => navigate("/apps"),
  });

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={24} className={styles.spin} />
        <span style={{ marginLeft: "0.5rem" }}>Loading app details...</span>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className={styles.container}>
        <Link to="/apps" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Apps
        </Link>
        <div className={styles.notFound}>
          <p>App not found or failed to load.</p>
        </div>
      </div>
    );
  }

  const lastUpdated = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "never";

  return (
    <div className={styles.container}>
      <Link to="/apps" className={styles.backLink}>
        <ArrowLeft size={16} />
        Back to Apps
      </Link>

      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>{app.app_name}</h1>
          <p className={styles.url}>{app.base_url}</p>
          <button
            className={styles.deleteAppButton}
            onClick={() => deleteAction.requestDelete(app.app_id, app.app_name, app)}
          >
            <Trash2 size={14} />
            Delete App
          </button>
        </div>
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

      <div className={styles.infoCard}>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>App ID</span>
            <span className={styles.infoValue}>{app.app_id}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{app.email}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Website</span>
            <span className={styles.infoValue}>{app.website || "—"}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Created</span>
            <span className={styles.infoValue}>
              {format(new Date(app.created_at), "MMM d, yyyy")}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Repositories</span>
            <span className={styles.infoValue}>{app.repository_count}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Failed Notifications</span>
            <span className={styles.infoValue}>{app.failed_notification_count}</span>
          </div>
        </div>
        {app.description && (
          <div className={styles.infoItem} style={{ marginTop: "1rem" }}>
            <span className={styles.infoLabel}>Description</span>
            <span className={styles.infoValue}>{app.description}</span>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Repositories</h2>
          {app.failed_notification_count > 0 && !actions.bulkRetryOperationId && (
            <button
              onClick={() => actions.setShowRetryConfirm(true)}
              className={styles.bulkRetryButton}
            >
              <RotateCw size={14} />
              Retry All Failed ({app.failed_notification_count})
            </button>
          )}
          {app.repository_count > 0 && !actions.resyncOperationId && (
            <button
              onClick={() => actions.setShowResyncConfirm(true)}
              className={styles.resyncAllButton}
            >
              <RefreshCcw size={14} />
              Re-sync All Repos ({app.repository_count})
            </button>
          )}
        </div>

        {actions.bulkRetryOperationId && (
          <BulkProgress
            operationId={actions.bulkRetryOperationId}
            onComplete={actions.handleBulkRetryComplete}
            onCancel={actions.handleBulkRetryCancel}
          />
        )}

        {actions.resyncOperationId && (
          <BulkProgress
            operationId={actions.resyncOperationId}
            onComplete={actions.handleBulkResyncComplete}
            onCancel={actions.handleBulkResyncCancel}
          />
        )}

        <AppDetailRepoTable
          repositories={app.repositories}
          retryMutation={actions.retryMutation}
          resyncMutation={actions.resyncMutation}
          onResyncRepo={actions.handleResyncRepo}
        />
      </div>

      <ConfirmDialog
        open={actions.showRetryConfirm}
        title="Retry All Failed Notifications"
        message={`This will retry all ${app.failed_notification_count} failed notifications for ${app.app_name}. Continue?`}
        confirmLabel="Retry All"
        variant="warning"
        onConfirm={actions.handleBulkRetry}
        onCancel={() => actions.setShowRetryConfirm(false)}
      />

      <ConfirmDialog
        open={!!actions.pendingResync}
        title="Re-sync Repository"
        message={`This will re-sync ${actions.pendingResync?.repoName ?? ""} and re-send ALL files to the client app. This may trigger many notifications. Continue?`}
        confirmLabel="Re-sync"
        variant="danger"
        onConfirm={actions.confirmResyncRepo}
        onCancel={actions.cancelResyncRepo}
      />

      <ConfirmDialog
        open={actions.showResyncConfirm}
        title="Re-sync All Repositories"
        message={`This will re-sync all ${app.repository_count} repositories for ${app.app_name}. ALL files will be re-sent to the client. Continue?`}
        confirmLabel="Re-sync All"
        variant="danger"
        onConfirm={actions.handleBulkResync}
        onCancel={() => actions.setShowResyncConfirm(false)}
      />

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
