import type { XYPosition } from "@xyflow/react";

// D372 — arriving on a canvas from "Create canvas" (?addScript=<id>): what to do. Plain, so the
// decision is testable without a canvas. The script goes into the new canvas's empty seeded Script
// node (wired to the KB) when there is one, else onto a new node at the viewport centre (null).

export type AddFromUrlPlan =
  | { kind: "none" }
  | { kind: "wait" }
  | { kind: "add"; scriptId: string; into: string | null; position: XYPosition | null };

export type PlanNode = { id: string; type?: string; position: XYPosition; data: Record<string, unknown> };

export function planAddFromUrl(i: { scriptId: string | null; canEdit: boolean; nodes: PlanNode[] }): AddFromUrlPlan {
  if (!i.scriptId) return { kind: "none" };
  if (!i.canEdit) return { kind: "wait" };
  const empty = i.nodes.find((n) => n.type === "script" && !n.data.source && !n.data.parsed);
  return { kind: "add", scriptId: i.scriptId, into: empty?.id ?? null, position: empty?.position ?? null };
}
