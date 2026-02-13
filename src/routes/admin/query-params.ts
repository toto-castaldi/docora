import type { ListQueryParams } from "@docora/shared-types";

export interface ParsedQueryParams {
  page: number;
  limit: number;
  sort_by: string;
  sort_order: "asc" | "desc";
  search: string;
}

interface QueryParamDefaults {
  sort_by: string;
  sort_order: "asc" | "desc";
}

const ALLOWED_LIMITS = [5, 10, 20, 50, 100];

/**
 * Parse and validate common list query parameters.
 * sort_by validation is deferred to the per-endpoint whitelist check.
 */
export function parseQueryParams(
  query: ListQueryParams,
  defaults: QueryParamDefaults
): ParsedQueryParams {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);

  const rawLimit = parseInt(query.limit ?? "20", 10);
  const limit = ALLOWED_LIMITS.includes(rawLimit) ? rawLimit : 20;

  const rawOrder = query.sort_order?.toLowerCase();
  const sort_order: "asc" | "desc" =
    rawOrder === "asc" || rawOrder === "desc" ? rawOrder : defaults.sort_order;

  const sort_by = query.sort_by ?? defaults.sort_by;
  const search = (query.search ?? "").trim();

  return { page, limit, sort_by, sort_order, search };
}

/**
 * Validate sort_by against a whitelist of allowed columns.
 * Returns the mapped DB column name, or null if invalid.
 */
export function validateSortColumn<T extends Record<string, string>>(
  sortBy: string,
  allowedColumns: T
): string | null {
  return allowedColumns[sortBy] ?? null;
}
