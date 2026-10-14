"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { useCanvasEditable } from "./canvas-editable-context";
import { useAddScriptNode } from "@/hooks/use-add-script-node";
import { startAddFromUrl } from "@/lib/scripts/add-from-url";
import { viewportCentre } from "./viewport-centre";

/** D372 — headless. Arriving from an approved script's "Create canvas" (?addScript=<id>), adds that
 *  script once this session can edit. The parameter leaves the URL first, through
 *  history.replaceState (as the review drawer spends `?node=`), so a reload or Back never adds it
 *  again (script-to-canvas spec §3). The add itself is useAddScriptNode's: parse, avatar, toasts. */
export function AddScriptFromUrl() {
  // Read so the effect re-runs when the URL changes; the href itself is read from window.
  const params = useSearchParams();
  const canEdit = useCanvasEditable();
  const storeApi = useCanvasStoreApi();
  const reactFlow = useReactFlow();
  const addScript = useAddScriptNode();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    // AppNode's data is a typed union; the plan only reads `source` / `parsed`.
    const nodes = storeApi.getState().nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown> }));
    done.current = startAddFromUrl({
      href: window.location.href,
      canEdit,
      nodes,
      replaceUrl: (url) => window.history.replaceState(null, "", url),
      add: (scriptId, into, position) =>
        void addScript(scriptId, position ?? viewportCentre(reactFlow), { into: into ?? undefined }),
    });
  }, [params, canEdit, storeApi, reactFlow, addScript]);

  return null;
}
