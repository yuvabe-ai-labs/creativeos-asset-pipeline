import type { CompositeNodeData } from "@/lib/canvas-nodes";
import type { PanelRecipe } from "@/lib/db/script-panels";
import { PANEL_MODEL_ID } from "./visualise/constants";
import { panelTitle, type StoryboardPanel } from "./storyboard";
import type { StoryboardCompositeData } from "./asset-nodes";

// D454 — a storyboard panel on the canvas is a Composite, not a File: the panel the script drew
// is its v1, recorded as it was made (the prompt, the model and its settings, every reference
// picture), so the operator can redraw it, edit it, or make it real by wiring an avatar or a
// product, all with the Composite's own versions.

/** What a storyboard Composite's v1 says it is, in `inputs_used.source`. */
export const STORYBOARD_VERSION_SOURCE = "storyboard";
export const STORYBOARD_PROMPT_ID = "storyboard-panel";

/** What the browser sends for each panel Fan out places; the server builds the rest. */
export type StoryboardCompositeRequest = { nodeId: string; label: string; position: { x: number; y: number } };

/** The Composite's own data: named as the panel, set up to draw exactly as the panel was drawn. */
export function storyboardCompositeData(
  panel: StoryboardPanel,
  recipe: PanelRecipe,
): CompositeNodeData & StoryboardCompositeData {
  return {
    title: panelTitle(panel),
    instruction: recipe.prompt,
    modelId: recipe.modelUsed ?? PANEL_MODEL_ID,
    params: recipe.params,
    ...(recipe.width && recipe.height ? { mediaWidth: recipe.width, mediaHeight: recipe.height } : {}),
    storyboardPanel: panel.label,
    storyboardSketchUrl: panel.url,
  };
}

/** The pictures the panel was drawn from, in its order. The house style is recorded by id (it is
 *  inline, D346); here it becomes `houseStyle.url`, a stored copy, so no bytes travel. */
export function recipeReferenceUrls(inputs: Record<string, unknown>, houseStyle: { id: string; url: string }): string[] {
  const urls = Array.isArray(inputs.referenceUrls) ? inputs.referenceUrls.filter((u): u is string => typeof u === "string") : [];
  return urls.map((u) => (u === houseStyle.id ? houseStyle.url : u));
}

/** v1's `inputs_used`: the panel's recipe, which a later Generate reads back to redraw it. */
export function storyboardVersionInputs(recipe: PanelRecipe, referenceImageUrls: string[]): Record<string, unknown> {
  return {
    source: STORYBOARD_VERSION_SOURCE,
    promptId: STORYBOARD_PROMPT_ID,
    instruction: recipe.prompt,
    prompt: recipe.prompt,
    referenceImageUrls,
    takeId: recipe.takeId,
    generationId: recipe.generationId,
  };
}

/** The panel prompt's first paragraph: its drawing style. */
export const sketchStyleParagraph = (prompt: string): string => prompt.split(/\n\s*\n/)[0]?.trim() ?? "";

/**
 * D454 — whether Generate redraws a storyboard Composite as a panel: while its instruction still
 * opens with the panel's drawing-style paragraph, it is drawn as the script page draws it (the
 * recorded pictures first, the prompt as written). Once the operator removes that paragraph, it is
 * an ordinary Composite: a real picture from what is wired.
 */
export function drawsAsSketch(instruction: string, recipePrompt: string): boolean {
  const style = sketchStyleParagraph(recipePrompt);
  return style.length > 0 && instruction.trim().startsWith(style);
}
