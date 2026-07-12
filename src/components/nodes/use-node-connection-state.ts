"use client";

import { useConnection } from "@xyflow/react";
import { canConnect } from "@/lib/canvas-nodes";

type ConnectionState = "idle" | "source" | "valid" | "invalid";

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
  if (!connection.inProgress) return "idle";
  if (connection.fromNode?.id === nodeId) return "source";
  return canConnect(connection.fromNode?.type ?? "", nodeType) ? "valid" : "invalid";
}
