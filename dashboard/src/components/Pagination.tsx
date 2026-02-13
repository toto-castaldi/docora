import styles from "./Pagination.module.css";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  filteredTotal?: number;
}

const PAGE_SIZES = [5, 10, 20, 50, 100];

/**
 * Builds page number array with ellipsis markers.
 * For <= 7 pages: show all. Otherwise: [1] ... [nearby] ... [last]
 */
function buildPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 3) pages.push("ellipsis");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("ellipsis");

  pages.push(total);
  return pages;
}

function ResultCount({ page, limit, total, filteredTotal }: {
  page: number;
  limit: number;
  total: number;
  filteredTotal?: number;
}) {
  const displayTotal = filteredTotal ?? total;
  const start = displayTotal === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, displayTotal);

  const range = `Showing ${start}-${end} of ${displayTotal} results`;
  const suffix = filteredTotal !== undefined ? ` (${total} total)` : "";

  return <span className={styles.resultCount}>{range}{suffix}</span>;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  filteredTotal,
}: PaginationProps) {
  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <div className={styles.container}>
      <ResultCount
        page={page}
        limit={limit}
        total={total}
        filteredTotal={filteredTotal}
      />

      <div className={styles.controls}>
        <select
          className={styles.pageSizeSelect}
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>

        <div className={styles.pageButtons}>
          <button
            className={`${styles.pageButton} ${page <= 1 ? styles.disabled : ""}`}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>

          {pageNumbers.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${i}`} className={styles.ellipsis}>...</span>
            ) : (
              <button
                key={p}
                className={`${styles.pageButton} ${p === page ? styles.active : ""}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            ),
          )}

          <button
            className={`${styles.pageButton} ${page >= totalPages ? styles.disabled : ""}`}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
