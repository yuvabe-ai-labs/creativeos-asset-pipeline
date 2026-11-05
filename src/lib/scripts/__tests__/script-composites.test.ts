import { describe, it, expect } from "vitest";
import {
  drawsAsSketch,
  recipeReferenceUrls,
  storyboardCompositeData,
  storyboardVersionInputs,
} from "../script-composites";
import type { PanelRecipe } from "@/lib/db/script-panels";

const recipe: PanelRecipe = {
  takeId: "t1",
  url: "https://x/s1.png",
  prompt: "Draw a loose marker sketch.\n\nThis shot: he checks his watch.",
  width: 768,
  height: 1365,
  generationId: "g1",
  modelUsed: "gemini:gemini-nano-banana-2.1",
  params: { aspect_ratio: "9:16" },
  inputs: { referenceUrls: ["https://x/maya.png", "house-style:v1"] },
};
const panel = { label: "S1", beat: "Hook", shotId: "s01", url: "https://x/s1.png", takeId: "t1" };

describe("storyboard Composites (D454)", () => {
  it("is named as the panel and set up to draw exactly as the panel was drawn", () => {
    expect(storyboardCompositeData(panel, recipe)).toEqual({
      title: "S1 · HOOK — storyboard",
      instruction: recipe.prompt,
      modelId: "gemini:gemini-nano-banana-2.1",
      params: { aspect_ratio: "9:16" },
      mediaWidth: 768,
      mediaHeight: 1365,
      storyboardPanel: "S1",
      storyboardSketchUrl: "https://x/s1.png",
    });
  });

  it("records the panel's pictures in order, with the house style as its stored copy", () => {
    const urls = recipeReferenceUrls(recipe.inputs, { id: "house-style:v1", url: "https://x/house-style.jpg" });
    expect(urls).toEqual(["https://x/maya.png", "https://x/house-style.jpg"]);
    expect(storyboardVersionInputs(recipe, urls)).toMatchObject({
      source: "storyboard", prompt: recipe.prompt, referenceImageUrls: urls, takeId: "t1", generationId: "g1",
    });
  });

  it("redraws as a sketch while the instruction opens with the drawing style, and not once it is gone", () => {
    expect(drawsAsSketch(recipe.prompt, recipe.prompt)).toBe(true);
    expect(drawsAsSketch(`${recipe.prompt}\n\nHe smiles.`, recipe.prompt)).toBe(true);
    expect(drawsAsSketch("This shot: he checks his watch, a real photo.", recipe.prompt)).toBe(false);
    expect(drawsAsSketch("anything", "")).toBe(false);
  });
});
