"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { pointerAction, urlWithParam } from "@/lib/review/focus-pointer";

// D473 — `?node=<id>` names the node whose focus view is open, so the URL can be copied and
// shared (a bug report, "look at this clip") and opens that node directly. It used to be an
// inbox-only arrival instruction (D165 / R9.3), spent when the view closed; now any focus view
// writes it while open and drops it on close.
//
// Reads the LIVE URL (useSearchParams tracks replaceState too), latched on the pointer's value:
// a second link to the canvas already on screen is a soft navigation and remounts nothing.
// Keyed on the canvas's nodes as well, because on a fresh load they hydrate after this mounts.
export function useNodeLink({ onReviewArrival }: { onReviewArrival: () => void }) {
  const { setCenter, getNode } = useReactFlow();
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const setFocusSection = useCanvasStore((s) => s.setFocusSection);
  const nodes = useCanvasStore((s) => s.nodes);
  // The view on top is the one the link names (a view can open over another).
  const openId = useCanvasStore((s) => s.openFocusViewIds.at(-1) ?? null);

  const searchParams = useSearchParams();
  const pointer = searchParams.get("node");
  const review = searchParams.has("review");
  const handledRef = useRef<string | null>(null);

  // Arrival: fly to the node and open it. While a view is open the URL can only be stale (the
  // views are modal, so no link can be followed): Next.js writes back the URL of a view just
  // left when a server action queued ahead of our replaceState finishes. Point it back at the
  // open view rather than reopening the old one (pointerAction).
  useEffect(() => {
    if (!pointer) {
      handledRef.current = null;
      return;
    }
    const action = pointerAction(pointer, handledRef.current, openId);
    if (action === "correct") {
      const fixed = urlWithParam(window.location.href, "node", openId);
      if (fixed) window.history.replaceState(null, "", fixed);
      return;
    }
    if (action !== "open") return;
    const node = getNode(pointer);
    if (!node) return; // not hydrated yet, or deleted; the next nodes change re-runs this
    handledRef.current = pointer;
    setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    // An inbox link (`?review=1`) is a reviewer following a count: land on Details, where
    // sign-off lives, and put the list on screen (D161). A shared link opens the view as is.
    if (review) {
      setFocusSection("details");
      onReviewArrival();
    }
    setFocusedNodeId(pointer);
  }, [pointer, review, openId, getNode, setCenter, setFocusSection, setFocusedNodeId, onReviewArrival, nodes]);

  // The URL follows the open view. Only a CHANGE writes: on load nothing is open yet while the
  // link's node hydrates, and clearing then would throw the link away before it was followed.
  // replaceState, not the router: the page is force-dynamic, so a router write refetches the
  // canvas to change nothing, and opening views should not fill the Back button.
  const lastOpenRef = useRef<string | null>(null);
  useEffect(() => {
    if (openId === lastOpenRef.current) return;
    lastOpenRef.current = openId;
    // Mark it handled first so the arrival effect does not re-open what is already open.
    if (openId) handledRef.current = openId;
    const next = urlWithParam(window.location.href, "node", openId);
    if (next) window.history.replaceState(null, "", next);
  }, [openId]);
}
