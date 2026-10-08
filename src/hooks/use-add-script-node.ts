"use client";

import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { toast } from "sonner";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useAddAvatarNode } from "./use-add-avatar-node";
import { scriptsService } from "@/services/scripts.service";
import { addScriptToCanvas } from "@/lib/scripts/add-to-canvas";
import { parseScriptNode } from "@/lib/nodes/parse-script-node";
import { CURRENT_GROUPING_VERSION } from "@/lib/nodes/group-shots";

// Spec 1 §5.2 — an approved script onto the canvas: a Script node holding the script printed in
// the team's layout, parsed straight away exactly like an upload (no fan-out, as the upload path),
// with the lead's avatar attached when it has a usable one. The node holds a COPY: re-approving
// the script later never changes a node already on a canvas (spec 1 §5.4). The steps, and every
// failure path, live in `addScriptToCanvas`; this hook only wires them to the canvas.
export function useAddScriptNode() {
  const clientId = useClientId();
  const storeApi = useCanvasStoreApi();
  const addAvatarNode = useAddAvatarNode();

  return useCallback(
    (scriptId: string, position: XYPosition) =>
      addScriptToCanvas(scriptId, position, {
        getDetail: (id) => scriptsService.get(clientId, id),
        addScriptNode: (nodeId, pos, data) => {
          const { addNode, updateNodeData } = storeApi.getState();
          addNode("script", pos, nodeId);
          updateNodeData(nodeId, data);
        },
        attachAvatar: (avatarId, nodeId, pos) => addAvatarNode(avatarId, { position: pos, presenterOf: nodeId }),
        parse: (nodeId, source) => parseScriptNode(nodeId, source),
        writeParsed: (nodeId, output) =>
          storeApi.getState().updateNodeData(nodeId, { parsed: output, groupingVersion: CURRENT_GROUPING_VERSION }),
        newId: () => crypto.randomUUID(),
        toast: {
          loading: (m) => toast.loading(m),
          success: (m, opts) => void toast.success(m, opts),
          error: (m, opts) => void toast.error(m, opts),
        },
      }),
    [clientId, storeApi, addAvatarNode],
  );
}
