import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRetryProgress, cancelRetry } from "../api/admin";
import styles from "./BulkProgress.module.css";

interface BulkProgressProps {
  operationId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function BulkProgress({
  operationId,
  onComplete,
  onCancel,
}: BulkProgressProps) {
  const completedRef = useRef(false);

  const { data: progress } = useQuery({
    queryKey: ["bulk-progress", operationId],
    queryFn: () => fetchRetryProgress(operationId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return data.completed >= data.total || data.cancelled ? false : 2000;
    },
  });

  useEffect(() => {
    if (!progress || completedRef.current) return;
    if (progress.completed >= progress.total || progress.cancelled) {
      completedRef.current = true;
      const timer = setTimeout(onComplete, 1000);
      return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  const handleCancel = async () => {
    await cancelRetry(operationId);
    onCancel();
  };

  if (!progress) {
    return (
      <div className={styles.container}>
        <p className={styles.starting}>Starting...</p>
      </div>
    );
  }

  const percentage =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  const isDone = progress.completed >= progress.total;

  return (
    <div className={styles.container}>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={styles.stats}>
        <span>
          {progress.completed}/{progress.total} completed ({progress.succeeded}{" "}
          succeeded, {progress.failed} failed)
        </span>
        {progress.cancelled ? (
          <span className={styles.cancelled}>Cancelled</span>
        ) : (
          !isDone && (
            <button className={styles.cancelButton} onClick={handleCancel}>
              Cancel
            </button>
          )
        )}
      </div>
    </div>
  );
}
