"use client";

import { useEffect, useRef } from "react";
import { useIdentity } from "./use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";

// Coalesces a burst of writes on one node — a batch duplicate, a decision that also lands
// as an UPDATE, the echo of the viewer's own save — into one refresh. Same value
// use-review-list.ts uses, for the same reason.
const REFRESH_DEBOUNCE_MS = 400;

// D179 — keep an OPEN focus view live: when someone else approves, rejects or regenerates
// the node you are looking at, the panel updates in place instead of showing stale state
// until you close and reopen it.
//
// Why this filters rather than just refetching on any ping: the underlying channel is
// ORG-WIDE (one channel for every subscriber, which is what keeps channel count flat as
// the org grows). Without the node filter, every generation anywhere in the org would
// refetch every open focus view — N people generating × M open views. The filter turns
// that into "refetch only when this node actually changed", which is rare.
//
// A null nodeId means the event carried no identifiable row (a DELETE without REPLICA
// IDENTITY FULL). Treated as "might be mine" and refreshed: a redundant refetch is
// cheap, a missed one leaves the panel silently wrong.
export function useNodeVersionUpdates(
  nodeId: string,
  enabled: boolean,
  onChange: () => void,
) {
  const { orgId } = useIdentity();

  // Kept in a ref so a caller passing an inline function (both focus views do — their
  // fetchVersions is redeclared every render) doesn't tear down and rebuild the
  // subscription on every render. Written inside an effect, never during render, which
  // react-hooks/refs forbids.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!enabled || !orgId || !nodeId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToOrgVersionUpdates(orgId, (changedNodeId) => {
      if (changedNodeId !== null && changedNodeId !== nodeId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), REFRESH_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, orgId, nodeId]);
}
