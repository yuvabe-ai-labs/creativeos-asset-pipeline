import type { AppNode, ScriptNodeData } from "@/lib/canvas-nodes";
import { panelTitle } from "@/lib/scripts/storyboard";
import type { GalleryImage } from "./types";

export type StoryboardGroup = { scriptNodeId: string; title: string; images: GalleryImage[] };

/** D383 — the References tab's Storyboard: one group per Script node on this canvas that came
 *  with approved panels, in shot order. Read from the canvas, so removing the Script node removes
 *  its group (spec A3), and a panel unlinked by an edit is still here (spec §3). */
export function storyboardGroups(nodes: readonly AppNode[]): StoryboardGroup[] {
  return nodes.flatMap((n) => {
    if (n.type !== "script") return [];
    const d = n.data as ScriptNodeData;
    const panels = d.storyboard?.panels ?? [];
    if (panels.length === 0) return [];
    const title = d.title?.trim() || "Script";
    return [{
      scriptNodeId: n.id,
      title,
      images: panels.map((p) => ({
        id: `storyboard:${n.id}:${p.shotId}`,
        imageUrl: p.url,
        previewUrl: p.url,
        filename: panelTitle(p),
        subtitle: title,
        source: "storyboard" as const,
      })),
    }];
  });
}
