import type { AppNode, ScriptNodeData } from "@/lib/canvas-nodes";
import { panelTitle } from "@/lib/scripts/storyboard";
import type { GalleryImage } from "./types";

export type StoryboardGroup = { scriptNodeId: string; title: string; images: GalleryImage[] };

/** D383 — the References tab's Storyboard: one group per Script node on this canvas that came
 *  with storyboard panels, in shot order. Read from the canvas, so removing the Script node removes
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

/** The References search applied to the Storyboard section too: a group whose script title
 *  matches keeps every panel; otherwise only the panels whose names match stay, and a group left
 *  with none goes. Case-insensitive, anywhere in the name. An empty query changes nothing. */
export function filterStoryboardGroups(groups: StoryboardGroup[], query: string): StoryboardGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.flatMap((g) => {
    if (g.title.toLowerCase().includes(q)) return [g];
    const images = g.images.filter((i) => i.filename.toLowerCase().includes(q));
    return images.length > 0 ? [{ ...g, images }] : [];
  });
}
