import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (columnKey: string) => void;
  rowKey: (item: T) => string;
  isLoading?: boolean;
}

function SortIcon({ columnKey, sortBy, sortOrder }: {
  columnKey: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}) {
  if (columnKey !== sortBy) {
    return <ChevronsUpDown size={14} color="#9ca3af" />;
  }
  return sortOrder === "asc"
    ? <ChevronUp size={14} />
    : <ChevronDown size={14} />;
}

function HeaderCell<T>({ column, sortBy, sortOrder, onSort }: {
  column: Column<T>;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  if (!column.sortable) {
    return <th className={styles.headerCell}>{column.label}</th>;
  }

  return (
    <th
      className={`${styles.headerCell} ${styles.sortableHeader}`}
      onClick={() => onSort(column.key)}
    >
      <span className={styles.sortableContent}>
        {column.label}
        <SortIcon columnKey={column.key} sortBy={sortBy} sortOrder={sortOrder} />
      </span>
    </th>
  );
}

export function DataTable<T>({
  columns,
  data,
  sortBy,
  sortOrder,
  onSort,
  rowKey,
  isLoading,
}: DataTableProps<T>) {
  const tbodyClass = isLoading ? styles.loading : undefined;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((col) => (
            <HeaderCell
              key={col.key}
              column={col}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
          ))}
        </tr>
      </thead>
      <tbody className={tbodyClass}>
        {data.length === 0 ? (
          <tr>
            <td className={styles.emptyRow} colSpan={columns.length}>
              No results found
            </td>
          </tr>
        ) : (
          data.map((item) => (
            <tr key={rowKey(item)} className={styles.row}>
              {columns.map((col) => (
                <td key={col.key} className={styles.bodyCell}>
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
