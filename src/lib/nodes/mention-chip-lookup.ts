import type { UpstreamNode } from "@/components/nodes/connected-inputs-card";

type Mentionable = { id: string; label: string; type: string; fileUrl?: string; fileKind?: string };

/**
 * The mention editor's chip lookup: every upstream, then every mentionable over it. A mentionable
 * relabels its entry but must not drop the image an upstream (or the mentionable itself) carries —
 * a chip reads `fileUrl`/`fileKind` for its thumbnail, and the composite's avatar chip shows its
 * front image (D310). A refine note's mentionables carry no image and are not upstream; they
 * resolve exactly as before.
 */
export function mentionChipLookup(
  upstream: UpstreamNode[],
  mentionables: Mentionable[] | undefined,
): Map<string, UpstreamNode> {
  const map = new Map<string, UpstreamNode>(upstream.map((u) => [u.id, u]));
  for (const m of mentionables ?? []) {
    map.set(m.id, {
      ...map.get(m.id),
      id: m.id,
      label: m.label,
      type: m.type,
      ...(m.fileUrl ? { fileUrl: m.fileUrl } : {}),
      ...(m.fileKind ? { fileKind: m.fileKind } : {}),
    });
  }
  return map;
}
