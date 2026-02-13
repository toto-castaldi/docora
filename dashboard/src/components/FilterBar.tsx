import { useState, useEffect, useRef } from "react";
import { Search, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useDebouncedValue } from "../hooks/useDebouncedValue.ts";
import styles from "./FilterBar.module.css";

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters?: FilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string | null) => void;
}

const DEBOUNCE_MS = 300;

export function FilterBar({
  search,
  onSearchChange,
  filters,
  filterValues,
  onFilterChange,
}: FilterBarProps) {
  const [rawSearch, setRawSearch] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(rawSearch, DEBOUNCE_MS);
  const userTypedRef = useRef(false);

  // Sync debounced value to parent (only when user typed, not external clear)
  useEffect(() => {
    if (debouncedSearch !== search && userTypedRef.current) {
      onSearchChange(debouncedSearch);
      userTypedRef.current = false;
    }
  }, [debouncedSearch, search, onSearchChange]);

  // Sync external search prop back to internal state (URL bookmark restore / clear)
  useEffect(() => {
    userTypedRef.current = false;
    setRawSearch(search);
  }, [search]);

  const handleInput = (value: string) => {
    userTypedRef.current = true;
    setRawSearch(value);
  };

  const hasFilters = filters && filters.length > 0;
  const hasActiveFilters = filterValues && Object.values(filterValues).some(Boolean);

  const toggleClass = `${styles.filtersToggle} ${
    filtersOpen || hasActiveFilters ? styles.filtersToggleActive : ""
  }`;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.searchWrapper}>
          <Search size={16} color="#9ca3af" />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search..."
            value={rawSearch}
            onChange={(e) => handleInput(e.target.value)}
          />
        </div>

        {hasFilters && (
          <button
            className={toggleClass}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter size={16} />
            Filters
            {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {filtersOpen && hasFilters && (
        <div className={styles.filtersPanel}>
          {filters.map((filter) => (
            <div key={filter.key} className={styles.filterGroup}>
              <label className={styles.filterLabel}>{filter.label}</label>
              <select
                className={styles.filterSelect}
                value={filterValues?.[filter.key] || ""}
                onChange={(e) =>
                  onFilterChange?.(filter.key, e.target.value || null)
                }
              >
                <option value="">All</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
