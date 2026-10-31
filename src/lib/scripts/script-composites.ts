import type { CompositeNodeData } from "@/lib/canvas-nodes";
import type { PanelRecipe, PlateRecipe } from "@/lib/db/script-panels";
import { PANEL_MODEL_ID } from "./visualise/constants";
import { panelTitle, type StoryboardPanel } from "./storyboard";
import type { LocationCompositeMark, StoryboardCompositeData } from "./asset-nodes";
import type { ScriptLocation } from "./schema";

// D454 — a storyboard panel on the canvas is a Composite, not a File: the panel the script drew
// is its v1, recorded as it was made (the prompt, the model and its settings, every reference
// picture), so the operator can redraw it, edit it, or make it real by wiring an avatar or a
// product, all with the Composite's own versions. D456 — so is a location plate the script page
// generated: what the script generated arrives as a Composite with its generation as v1.

/** What a storyboard Composite's v1 says it is, in `inputs_used.source`. */
export const STORYBOARD_VERSION_SOURCE = "storyboard";
export const STORYBOARD_PROMPT_ID = "storyboard-panel";

/** D460 — a storyboard Composite as Fan out shows it at once, before the server has recorded it:
 *  named as the panel and showing it. The server answer adds the instruction, model and settings. */
export function pendingStoryboardData(panel: StoryboardPanel): CompositeNodeData & StoryboardCompositeData {
  return { title: panelTitle(panel), storyboardPanel: panel.label, storyboardSketchUrl: panel.url, parsed: panel.url };
}

/** D460 — a generated plate's Composite as Fan out shows it at once. */
export function pendingPlateData(scriptId: string, location: ScriptLocation): CompositeNodeData & LocationCompositeMark {
  return {
    title: location.name,
    scriptId,
    scriptAsset: { kind: "location", id: location.id, name: location.name, angle: 0 },
    parsed: location.image?.url,
  };
}

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

/** D456 — what a generated plate's Composite v1 says it is, in `inputs_used.source`. */
export const SCRIPT_PLATE_SOURCE = "script-plate";

/** What the browser sends for each generated plate Fan out places; the server builds the rest. */
export type ScriptPlateRequest = { nodeId: string; locationId: string; position: { x: number; y: number } };

/** A generated plate's Composite: named as the location, marked as its picture, and set up to draw
 *  as the plate was drawn. */
export function plateCompositeData(
  scriptId: string,
  location: ScriptLocation,
  recipe: PlateRecipe,
): CompositeNodeData & LocationCompositeMark {
  return {
    title: location.name,
    instruction: typeof recipe.inputs.prompt === "string" ? recipe.inputs.prompt : location.description,
    modelId: recipe.modelUsed ?? PANEL_MODEL_ID,
    params: recipe.params,
    scriptId,
    scriptAsset: { kind: "location", id: location.id, name: location.name, angle: 0 },
  };
}

/** The plate's v1 `inputs_used`: the prompt it was drawn with. */
export function plateVersionInputs(recipe: PlateRecipe): Record<string, unknown> {
  const prompt = typeof recipe.inputs.prompt === "string" ? recipe.inputs.prompt : "";
  return {
    source: SCRIPT_PLATE_SOURCE,
    promptId: recipe.inputs.promptId ?? null,
    instruction: prompt,
    prompt,
    referenceImageUrls: [],
    generationId: recipe.generationId,
  };
}
