"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// D300 — the app's one TanStack Query client: browser-side caching for data read from our own
// API routes (see CLAUDE.md, "Data fetching"). Made once per browser session in state, so a
// re-render never throws the cache away. Server Components keep fetching directly.
//
// staleTime 30 s: what a list shows is reused across the components that read it instead of each
// refetching on mount, and still refreshed soon after it changes. No refetch on window focus — a
// creative tool is focused and unfocused constantly, and a mid-edit refetch is noise.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
