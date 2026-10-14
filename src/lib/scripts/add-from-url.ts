import type { XYPosition } from "@xyflow/react";
import { urlWithoutParams } from "@/lib/review/focus-pointer";

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

/** Runs the plan for the page at `href`. `?addScript` leaves the URL first, synchronously, through
 *  `replaceUrl` (the component passes history.replaceState): a router.replace on this force-dynamic
 *  page refetches the whole canvas and only then writes the URL, so a quick reload re-added the
 *  script. True when the add started. */
export function startAddFromUrl(i: {
  href: string;
  canEdit: boolean;
  nodes: PlanNode[];
  replaceUrl: (url: string) => void;
  add: (scriptId: string, into: string | null, position: XYPosition | null) => void;
}): boolean {
  const plan = planAddFromUrl({ scriptId: new URL(i.href).searchParams.get("addScript"), canEdit: i.canEdit, nodes: i.nodes });
  if (plan.kind !== "add") return false;
  const next = urlWithoutParams(i.href, ["addScript"]);
  if (next) i.replaceUrl(next);
  i.add(plan.scriptId, plan.into, plan.position);
  return true;
}
