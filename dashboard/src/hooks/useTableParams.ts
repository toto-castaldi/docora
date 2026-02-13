import { useSearchParams } from "react-router";
import { useCallback } from "react";

export interface TableParamsDefaults {
  sortBy: string;
  sortOrder: "asc" | "desc";
}

/**
 * Manages table state (page, limit, sort, search, filters) via URL search params.
 * Changing any filter/search/sort automatically resets page to 1.
 */
export function useTableParams(defaults: TableParamsDefaults) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 20;
  const sortBy = searchParams.get("sort_by") || defaults.sortBy;
  const sortOrder = (searchParams.get("sort_order") || defaults.sortOrder) as "asc" | "desc";
  const search = searchParams.get("search") || "";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      // Reset page to 1 unless page is explicitly in updates
      if (!("page" in updates)) {
        next.set("page", "1");
      }

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const getFilter = useCallback(
    (key: string): string => searchParams.get(key) || "",
    [searchParams],
  );

  const setFilter = useCallback(
    (key: string, value: string | null) => {
      updateParams({ [key]: value });
    },
    [updateParams],
  );

  const clearAllFilters = useCallback(() => {
    const next = new URLSearchParams();
    // Keep only page (reset to 1) and limit
    if (searchParams.get("limit")) {
      next.set("limit", searchParams.get("limit")!);
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return {
    page,
    limit,
    sortBy,
    sortOrder,
    search,
    updateParams,
    getFilter,
    setFilter,
    clearAllFilters,
    searchParams,
  };
}
