"use client";

import { useEffect, useRef } from "react";
import { useIdentity } from "./use-identity";
import { subscribeToOrgMarketUpdates } from "@/lib/realtime/org-market-updates";

// Coalesces a burst of writes into one refresh. One archive is three UPDATEs on the same
// row — claim, complete, thumbnail backfill — and a batch clip from the extension is N
// INSERTs. Same value use-node-version-updates.ts and use-review-list.ts use.
const REFRESH_DEBOUNCE_MS = 400;

/** Pure so the org-wide → this-page filter can be tested without rendering. `null`
 *  means the event carried no identifiable row and is treated as "might be mine". */
export function isBoardEvent(boardIds: readonly string[], moodboardId: string | null): boolean {
  return moodboardId === null || boardIds.includes(moodboardId);
}

// D276 — keep an OPEN Market board live: when the archive task flips a tile to `ready`,
// a teammate clips to the board, or the nightly sweep repairs a thumbnail, the shelf
// updates in place instead of waiting for the next addReference refetch.
//
// The underlying channel is ORG-WIDE (one per org, so channel count stays flat). The
// board-id filter is what turns "anyone in the org clipped anything" into "one of the
// two boards on this page changed".
export function useMarketUpdates(
  boardIds: readonly string[],
  enabled: boolean,
  onChange: () => void,
) {
  const { orgId } = useIdentity();

  // Ref so useMarket can pass its `refresh` directly without the subscription being torn
  // down whenever that callback's identity changes. Written in an effect, never in render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Stable dependency: a new array literal each render must not resubscribe.
  const boardKey = boardIds.join("|");

  useEffect(() => {
    if (!enabled || !orgId || boardKey === "") return;
    const ids = boardKey.split("|");

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToOrgMarketUpdates(orgId, (moodboardId) => {
      if (!isBoardEvent(ids, moodboardId)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), REFRESH_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, orgId, boardKey]);
}
