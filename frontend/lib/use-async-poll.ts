"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Loads async data on mount / when deps change, optionally polls on an interval.
 * Avoids @tanstack/react-query so installs are not required for a successful build.
 */
export function useAsyncPoll<T>(
  deps: readonly unknown[],
  factory: () => Promise<T>,
  intervalMs: number | null
) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isPending, setIsPending] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial: boolean) {
      if (isInitial) setIsPending(true);
      try {
        const result = await factoryRef.current();
        if (!cancelled) {
          setData(result);
          setIsError(false);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setIsError(true);
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled && isInitial) setIsPending(false);
      }
    }

    void load(true);

    if (intervalMs == null || intervalMs <= 0) {
      return () => {
        cancelled = true;
      };
    }

    const id = setInterval(() => void load(false), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the explicit refetch key
  }, deps);

  return {
    data,
    isPending,
    /** True only on the first load before any successful data (matches common useQuery semantics). */
    isLoading: isPending && data === undefined && !isError,
    isError,
    error,
  };
}
