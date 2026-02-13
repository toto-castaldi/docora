import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useEffect, useRef } from "react";
import { ApiError } from "../api/admin";

export const POLL_INTERVAL = 10_000; // 10 seconds

/**
 * Wrapper around useQuery with polling and error toast handling.
 * Shows toast on error, continues polling even when tab is hidden.
 */
export function usePollingQuery<TData>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn">
) {
  const lastErrorRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: true,
    ...options,
  });

  // Show toast on new errors (not on every poll failure)
  useEffect(() => {
    if (query.error) {
      const errorMessage =
        query.error instanceof ApiError
          ? query.error.message
          : "An error occurred";

      // Only show toast if error message changed
      if (lastErrorRef.current !== errorMessage) {
        lastErrorRef.current = errorMessage;
        toast.error(errorMessage);
      }
    } else {
      lastErrorRef.current = null;
    }
  }, [query.error]);

  return query;
}
