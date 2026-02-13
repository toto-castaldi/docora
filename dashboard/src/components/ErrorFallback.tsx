import { AlertTriangle } from "lucide-react";
import type { FallbackProps } from "react-error-boundary";
import styles from "./ErrorFallback.module.css";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className={styles.container}>
      <AlertTriangle size={48} className={styles.icon} />
      <h2 className={styles.title}>Something went wrong</h2>
      <p className={styles.message}>{message}</p>
      <button onClick={resetErrorBoundary} className={styles.retryButton}>
        Try again
      </button>
    </div>
  );
}
