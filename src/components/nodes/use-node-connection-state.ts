"use client";

import { useConnection } from "@xyflow/react";
import { canAcceptIncoming, canConnect } from "@/lib/canvas-nodes";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

export type ConnectionState = "idle" | "source" | "valid" | "invalid";

/**
 * Returns the connection state of a node relative to any in-progress drag.
 * - "idle"    — no drag is active
 * - "source"  — this node is the drag origin (never dim the source)
 * - "valid"   — this node is a valid target for the dragged source type
 * - "invalid" — this node is not a valid target; should be visually dimmed
 */
export function useNodeConnectionState(
  nodeId: string,
  nodeType: string,
): ConnectionState {
  const connection = useConnection();
  // Counted only while a drag is on (O(edges), and a plain 0 otherwise), so a full node (one that
  // takes a single input) is not offered as a drop target.
  const incoming = useCanvasStore((s) => (connection.inProgress ? s.edges.filter((e) => e.target === nodeId).length : 0));
  if (!connection.inProgress) return "idle";
  return connectionStateFor(nodeId, nodeType, connection.fromNode?.id, connection.fromNode?.type ?? "", incoming);
}

/** The pure rule behind the hook: the origin never dims, and a target must both accept the
 *  dragged type and have room for another input. */
export function connectionStateFor(
  nodeId: string,
  nodeType: string,
  fromId: string | undefined,
  fromType: string,
  incoming: number,
): ConnectionState {
  if (fromId === nodeId) return "source";
  return canConnect(fromType, nodeType) && canAcceptIncoming(nodeType, incoming) ? "valid" : "invalid";
}
