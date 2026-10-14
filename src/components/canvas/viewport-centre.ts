import type { XYPosition } from "@xyflow/react";

/** The flow position at the centre of the visible canvas: where a node added without a target
 *  lands (the gallery's add button, the Create-canvas hand-off). */
export function viewportCentre(rf: { screenToFlowPosition: (p: { x: number; y: number }) => XYPosition }): XYPosition {
  const el = document.querySelector<HTMLDivElement>(".react-flow");
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  return rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}
