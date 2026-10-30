import type { CompositeNodeData } from "@/lib/canvas-nodes";
import type { StoryboardCompositeData } from "@/lib/scripts/asset-nodes";
import type { StoryboardCompositeRequest } from "@/lib/scripts/storyboard-composite";
import { readJson } from "./read-json";

/** A storyboard Composite the server made, with its v1 already active (D454). */
export type CreatedStoryboardComposite = {
  id: string;
  position: { x: number; y: number };
  data: CompositeNodeData & StoryboardCompositeData;
  /** v1's picture: the panel. */
  output: string;
};

/** D454 — Fan out's storyboard Composites: one per panel, each with the panel as its v1. */
export async function createStoryboardComposites(
  canvasId: string,
  body: { scriptNodeId: string; panels: StoryboardCompositeRequest[] },
): Promise<CreatedStoryboardComposite[]> {
  const res = await fetch(`/api/canvas/${canvasId}/storyboard-composites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await readJson<{ nodes: CreatedStoryboardComposite[] }>(res, "Couldn't add the storyboard.")).nodes;
}
