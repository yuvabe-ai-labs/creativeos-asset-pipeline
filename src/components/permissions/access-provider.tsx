"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateMe, meKeys, useMe } from "@/hooks/queries/me";
import { onAccessDenied } from "@/lib/permissions/access-signal";
import { accessFromMe } from "@/lib/me/access";
import { NO_ACCESS } from "@/lib/permissions/model";
import type { MePayload } from "@/lib/me/types";
import { AccessContext, type BrowserAccess } from "./access-context";

// D504. The root layout hands over the payload it built for this request; it seeds the me query
// (so the first render already shows the right buttons, with no request) and becomes the ONE
// Access for the whole app. Components read it from context (performance rules 1 and 2).
export function AccessProvider({ initial, children }: { initial: MePayload | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data } = useMe(initial ?? undefined);

  // Structural sharing keeps `data` the same object until /api/me really changes, so an unchanged
  // refetch builds nothing and re-renders no reader.
  const value = useMemo<BrowserAccess>(
    () => (data ? { access: accessFromMe(data), orgId: data.orgId } : { access: NO_ACCESS, orgId: "" }),
    [data],
  );

  // A newer server payload (router.refresh(), a soft navigation after signing in) wins.
  const seeded = useRef(initial);
  useEffect(() => {
    if (!initial || initial === seeded.current) return;
    seeded.current = initial;
    queryClient.setQueryData(meKeys.current(), initial);
  }, [initial, queryClient]);

  useEffect(() => onAccessDenied(() => void invalidateMe(queryClient)), [queryClient]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
