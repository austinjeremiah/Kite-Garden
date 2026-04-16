"use client";

/** Previously wrapped the app in TanStack Query; data hooks now use `useAsyncPoll` instead. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
