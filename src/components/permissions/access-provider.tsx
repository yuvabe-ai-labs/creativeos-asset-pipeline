"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AbilityProvider } from "@casl/react";
import { invalidateMe, meKeys, useMe } from "@/hooks/queries/me";
import { onAccessDenied } from "@/lib/permissions/access-signal";
import { abilityFromPacked, rulesFromPacked } from "@/lib/permissions/browser";
import type { MePayload } from "@/lib/me/types";

// D493 §6.3. The root layout hands over the payload it built for this request; it seeds the me
// query (so the first render already shows the right buttons, with no request) and becomes the
// ONE ability for the whole app. Components read it from context (performance rules 1 and 2).
export function AccessProvider({ initial, children }: { initial: MePayload | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data } = useMe(initial ?? undefined);
  const [ability] = useState(() => abilityFromPacked(data?.permissions ?? []));

  // New rules (a refetch after a 403 or on focus) update the same ability in place; useAbility()
  // re-renders its readers. Structural sharing keeps `permissions` the same array when nothing
  // changed, so an unchanged refetch updates nothing.
  const applied = useRef(data?.permissions);
  useEffect(() => {
    const next = data?.permissions;
    if (next === applied.current) return;
    applied.current = next;
    ability.update(rulesFromPacked(next ?? []));
  }, [data?.permissions, ability]);

  // A newer server payload (router.refresh(), a soft navigation after signing in) wins.
  const seeded = useRef(initial);
  useEffect(() => {
    if (!initial || initial === seeded.current) return;
    seeded.current = initial;
    queryClient.setQueryData(meKeys.current(), initial);
  }, [initial, queryClient]);

  useEffect(() => onAccessDenied(() => void invalidateMe(queryClient)), [queryClient]);

  return <AbilityProvider value={ability}>{children}</AbilityProvider>;
}
