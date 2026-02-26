import { useState } from "react";
import { Copy, Check } from "lucide-react";
import styles from "./CredentialsModal.module.css";

interface CopyFieldProps {
  label: string;
  value: string;
}

export function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.credentialGroup}>
      <span className={styles.label}>{label}</span>
      <div className={styles.valueRow}>
        <code className={styles.value}>{value}</code>
        <button
          type="button"
          className={copied ? styles.copiedButton : styles.copyButton}
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check size={14} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
