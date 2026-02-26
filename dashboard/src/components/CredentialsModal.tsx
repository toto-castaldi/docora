import { useRef, useEffect } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { CopyField } from "./CopyField.js";
import styles from "./CredentialsModal.module.css";

interface CredentialsModalProps {
  open: boolean;
  appId: string;
  token: string;
  onClose: () => void;
}

export function CredentialsModal({ open, appId, token, onClose }: CredentialsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <CheckCircle size={24} color="#16a34a" />
          <h3 className={styles.title}>App Onboarded Successfully</h3>
        </div>

        <div className={styles.warning}>
          <AlertTriangle size={18} color="#d97706" />
          <span>
            <strong>Save these credentials now.</strong> The token will not be shown again.
          </span>
        </div>

        <CopyField label="App ID" value={appId} />
        <CopyField label="Token" value={token} />

        <button type="button" className={styles.closeButton} onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
