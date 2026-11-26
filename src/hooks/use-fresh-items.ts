"use client";

import { useEffect, useState } from "react";
import { LANDED_MS } from "@/hooks/use-follow-copilot";
import { newItemIds } from "@/lib/market/new-items";

/** The references that appeared since the page last loaded its boards (D530), for the landed
 *  highlight; cleared after the same time a copilot change stays marked. Nothing is fetched: the
 *  ids are the ones the page already has. `ids` is null until the boards have loaded. */
export function useFreshItems(ids: string[] | null): Set<string> {
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  // Derived from what the page holds, during render (React's "adjust state on a prop change"),
  // so a new tile is marked on the very render it first appears.
  if (ids !== null && (seen === null || ids.length !== seen.size || ids.some((id) => !seen.has(id)))) {
    const added = newItemIds(seen, ids);
    setSeen(new Set(ids));
    if (added.size > 0) setFresh(added);
  }
  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = setTimeout(() => setFresh(new Set()), LANDED_MS);
    return () => clearTimeout(timer);
  }, [fresh]);
  return fresh;
}
