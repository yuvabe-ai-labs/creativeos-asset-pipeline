"use client";

import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { fetchMe } from "@/services/me.service";
import { ApiError } from "@/services/read-json";
import type { MePayload } from "@/lib/me/types";

export const meKeys = {
  all: ["me"] as const,
  current: () => [...meKeys.all, "current"] as const,
};

// /login has no session yet, and the proxy refuses /api/me while a password change is owed.
// Fetching there would only cache a failure; the first real fetch happens once the path changes.
const NO_FETCH_PATHS = new Set(["/login", "/account/password"]);

// D504 (spec §5): refetched on window focus (overriding the app default, D300) once 30 s old, so a
// change made by the person's owner shows up without a reload. The root layout seeds it, so the
// first render needs no request.
export function meQueryOptions() {
  return queryOptions({
    queryKey: meKeys.current(),
    queryFn: fetchMe,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // A 4xx (a password change owed, a signed-out session) won't pass on a second try; anything
    // else gets the app's one retry.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
}

/** The signed-in person's identity and access. `initialData` is passed only by AccessProvider. */
export function useMe(initialData?: MePayload) {
  const pathname = usePathname();
  return useQuery({ ...meQueryOptions(), initialData, enabled: !NO_FETCH_PATHS.has(pathname ?? "") });
}

// cancelRefetch: false joins a fetch already in flight instead of restarting it: one refused
// response reported by both funnels, or a 403 on /api/me itself, never stacks up requests.
export function invalidateMe(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: meKeys.current() }, { cancelRefetch: false });
}
