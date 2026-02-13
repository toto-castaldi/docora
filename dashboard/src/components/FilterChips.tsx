import { X } from "lucide-react";
import styles from "./FilterChips.module.css";

interface Chip {
  key: string;
  label: string;
  value: string;
}

interface FilterChipsProps {
  chips: Chip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className={styles.container}>
      {chips.map((chip) => (
        <span key={chip.key} className={styles.chip}>
          <span className={styles.chipLabel}>{chip.label}:</span>
          {chip.value}
          <button
            className={styles.chipRemove}
            onClick={() => onRemove(chip.key)}
            aria-label={`Remove ${chip.label} filter`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <button className={styles.clearAll} onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
