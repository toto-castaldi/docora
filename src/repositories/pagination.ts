import type { SelectQueryBuilder } from "kysely";

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/**
 * Apply pagination to a Kysely SelectQueryBuilder.
 * Runs count + data queries in parallel from the same base query.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function paginateQuery<DB, TB extends keyof DB, O>(
  baseQuery: SelectQueryBuilder<DB, TB, O>,
  params: PaginationParams
): Promise<PaginatedResult<O>> {
  const { page, limit } = params;
  const offset = (page - 1) * limit;

  // Cast for count query: clearSelect + clearOrderBy (order irrelevant for count)
  const countQuery = (
    baseQuery as unknown as SelectQueryBuilder<
      DB,
      TB,
      Record<string, unknown>
    >
  )
    .clearSelect()
    .clearOrderBy()
    .select((eb) => eb.fn.countAll().as("total"));

  const [countResult, data] = await Promise.all([
    countQuery.executeTakeFirstOrThrow() as Promise<{
      total: string | number;
    }>,
    baseQuery.limit(limit).offset(offset).execute(),
  ]);

  const total = Number(countResult.total);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}
