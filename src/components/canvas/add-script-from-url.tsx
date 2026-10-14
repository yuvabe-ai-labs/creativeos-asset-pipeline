"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { useCanvasEditable } from "./canvas-editable-context";
import { useAddScriptNode } from "@/hooks/use-add-script-node";
import { planAddFromUrl } from "@/lib/scripts/add-from-url";
import { viewportCentre } from "./viewport-centre";

/** D372 — headless. Arriving from an approved script's "Create canvas" (?addScript=<id>), adds that
 *  script once this session can edit: the parameter is removed first, so a reload or Back never adds
 *  it again (script-to-canvas spec §3). The add itself is useAddScriptNode's: parse, avatar, toasts. */
export function AddScriptFromUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const canEdit = useCanvasEditable();
  const storeApi = useCanvasStoreApi();
  const reactFlow = useReactFlow();
  const addScript = useAddScriptNode();
  const done = useRef(false);
  const scriptId = params.get("addScript");

  useEffect(() => {
    if (done.current) return;
    // AppNode's data is a typed union; the plan only reads `source` / `parsed`.
    const nodes = storeApi.getState().nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown> }));
    const plan = planAddFromUrl({ scriptId, canEdit, nodes });
    if (plan.kind !== "add") return;
    done.current = true;
    const rest = new URLSearchParams(params.toString());
    rest.delete("addScript");
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
    void addScript(plan.scriptId, plan.position ?? viewportCentre(reactFlow), { into: plan.into ?? undefined });
  }, [scriptId, canEdit, params, pathname, router, storeApi, reactFlow, addScript]);

  return null;
}
