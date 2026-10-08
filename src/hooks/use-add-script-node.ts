"use client";

import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { toast } from "sonner";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useAddAvatarNode } from "./use-add-avatar-node";
import { scriptsService } from "@/services/scripts.service";
import { printScript } from "@/lib/scripts/print";
import { parseScriptNode } from "@/lib/nodes/parse-script-node";
import { CURRENT_GROUPING_VERSION } from "@/lib/nodes/group-shots";

// Spec 1 §5.2 — an approved script onto the canvas: a Script node holding the script printed in
// the team's layout, parsed straight away exactly like an upload (no fan-out, as the upload path),
// with the lead's avatar attached when it has a usable one. The node holds a COPY: re-approving
// the script later never changes a node already on a canvas (spec 1 §5.4).
export function useAddScriptNode() {
  const clientId = useClientId();
  const storeApi = useCanvasStoreApi();
  const addAvatarNode = useAddAvatarNode();

  return useCallback(
    async (scriptId: string, position: XYPosition) => {
      let detail;
      try {
        detail = await scriptsService.get(clientId, scriptId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load the script.");
        return;
      }
      if (detail.script.stage !== "approved") {
        toast.error("Only approved scripts can go on a canvas.");
        return;
      }

      const { header } = detail.script.doc;
      const source = printScript(detail.script.doc);
      const nodeId = crypto.randomUUID();
      const { addNode, updateNodeData } = storeApi.getState();
      addNode("script", position, nodeId);
      updateNodeData(nodeId, { title: header.title, source });
      if (detail.leadAvatarId) addAvatarNode(detail.leadAvatarId, { position, presenterOf: nodeId });

      const toastId = toast.loading(`Parsing "${header.title}"…`);
      const result = await parseScriptNode(nodeId, source);
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      storeApi.getState().updateNodeData(nodeId, { parsed: result.output, groupingVersion: CURRENT_GROUPING_VERSION });
      const n = result.output.visual_script?.shots?.length ?? 0;
      toast.success(`"${header.title}" parsed into ${n} shot${n === 1 ? "" : "s"}`, { id: toastId });
    },
    [clientId, storeApi, addAvatarNode],
  );
}
