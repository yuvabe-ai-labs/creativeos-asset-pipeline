"use client";

import { useCallback } from "react";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { endFrameNodePosition } from "@/lib/video-gen/derive-end-frame";

/**
 * D84 — the end frame is an EDIT of the start frame, not a fresh generation. Interpolation
 * morphs in proportion to how far apart the two frames are, so the end frame must be a near
 * neighbour: same scene, same lighting, subject moved.
 *
 * Seeding is done with a graph edge rather than a data field. The image-gen focus view derives
 * its edit base from the connected upstream image node (`editBaseUrl = imageUrl ?? baseNodeUrl`),
 * and `activeTab` is local state — so connecting the start frame IS how you seed the edit.
 *
 * Wires three things: start frame → new node (the edit base), new node → video node (so its
 * output becomes an input), and an editInstruction to prompt the operator.
 */
export function useDeriveEndFrame() {
  const store = useCanvasStoreApi();

  const deriveEndFrame = useCallback(
    ({
      videoNodeId,
      startFrameNodeId,
      videoNodePosition,
    }: {
      videoNodeId: string;
      startFrameNodeId: string;
      videoNodePosition: { x: number; y: number };
    }): string => {
      const state = store.getState();
      const newNodeId = crypto.randomUUID();

      state.addNode("image-gen", endFrameNodePosition(videoNodePosition), newNodeId);
      state.updateNodeData(newNodeId, {
        title: "End frame",
        editInstruction: "",
      });
      // Start frame in — this is what the Edit tab annotates.
      state.connectNodes(startFrameNodeId, newNodeId);
      // Result out — feeds the video node, where it is assigned the end_frame role.
      state.connectNodes(newNodeId, videoNodeId);

      return newNodeId;
    },
    [store],
  );

  return { deriveEndFrame };
}
