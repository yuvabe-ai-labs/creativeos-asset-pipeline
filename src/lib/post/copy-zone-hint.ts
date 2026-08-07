export type CopyZone = {
  side: "top" | "bottom" | "left" | "right";
  fraction: number; // 0-1 of the frame, from that edge
};

const SIDE_LABEL: Record<CopyZone["side"], string> = {
  top: "upper",
  bottom: "lower",
  left: "left",
  right: "right",
};

// Renders a template's copy zone as a copyable sentence for the Image Gen prompt — the
// "contract" that turns negative-space composition from luck into something repeatable
// (post-node-design.md §6). Display-and-copy only in V1: nothing is written to another
// node, since edges run image-gen -> post and auto-injection would be an upstream write
// from a downstream node (D103).
export function copyZoneHint(zone: CopyZone): string {
  const pct = Math.round(zone.fraction * 100);
  return `Leave the ${SIDE_LABEL[zone.side]} ${pct}% of the frame clear and uncluttered — no key subject matter, no busy detail; this area will carry text.`;
}
