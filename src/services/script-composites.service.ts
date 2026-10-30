import type { CompositeNodeData } from "@/lib/canvas-nodes";
import type { ScriptPlateRequest, StoryboardCompositeRequest } from "@/lib/scripts/script-composites";
import { readJson } from "./read-json";

/** A Composite the server made from something the script generated, its v1 already active. */
export type CreatedScriptComposite = {
  id: string;
  position: { x: number; y: number };
  data: CompositeNodeData & Record<string, unknown>;
  /** v1's picture. */
  output: string;
};

/** D454, D456 — Fan out's Composites: one per storyboard panel and per generated location plate,
 *  each with that picture as its v1. */
export async function createScriptComposites(
  canvasId: string,
  body: { scriptNodeId: string; panels: StoryboardCompositeRequest[]; plates: ScriptPlateRequest[] },
): Promise<CreatedScriptComposite[]> {
  const res = await fetch(`/api/canvas/${canvasId}/script-composites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await readJson<{ nodes: CreatedScriptComposite[] }>(res, "Couldn't add the script's pictures.")).nodes;
}
