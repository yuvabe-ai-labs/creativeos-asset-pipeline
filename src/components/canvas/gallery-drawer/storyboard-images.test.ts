import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { filterStoryboardGroups, storyboardGroups } from "./storyboard-images";

const panel = (n: number) => ({ label: `S${n}`, beat: "Hook", shotId: `s0${n}`, url: `https://x/p${n}.png` });
const script = (id: string, data: object): AppNode => ({ id, type: "script", position: { x: 0, y: 0 }, data }) as AppNode;

describe("storyboardGroups (D383)", () => {
  it("makes one group per Script node with a storyboard, in shot order, named by its title", () => {
    const groups = storyboardGroups([
      script("a", { title: "Reel 12", storyboard: { scriptId: "x", panels: [panel(1), panel(2)] } }),
      { id: "f", type: "file", position: { x: 0, y: 0 }, data: {} } as AppNode,
      script("b", { title: "Reel 13", storyboard: { scriptId: "y", panels: [panel(1)] } }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Reel 12", "Reel 13"]);
    expect(groups[0].images).toEqual([
      { id: "storyboard:a:s01", imageUrl: "https://x/p1.png", previewUrl: "https://x/p1.png", filename: "S1 · HOOK — storyboard", subtitle: "Reel 12", source: "storyboard" },
      expect.objectContaining({ id: "storyboard:a:s02", filename: "S2 · HOOK — storyboard" }),
    ]);
  });

  it("skips Script nodes with no storyboard or no panels, and names an untitled one Script", () => {
    expect(storyboardGroups([script("a", {}), script("b", { storyboard: { scriptId: "x", panels: [] } })])).toEqual([]);
    expect(storyboardGroups([script("c", { storyboard: { scriptId: "x", panels: [panel(1)] } })])[0].title).toBe("Script");
  });
});

describe("filterStoryboardGroups — the References search over the Storyboard", () => {
  const groups = storyboardGroups([
    script("a", { title: "Reel 12", storyboard: { scriptId: "x", panels: [panel(1), { ...panel(2), beat: "Payoff" }] } }),
    script("b", { title: "Mango launch", storyboard: { scriptId: "y", panels: [panel(1)] } }),
  ]);

  it("changes nothing for an empty query", () => {
    expect(filterStoryboardGroups(groups, "  ")).toBe(groups);
  });

  it("keeps only the panels whose names match, case-insensitively", () => {
    const out = filterStoryboardGroups(groups, "PAYOFF");
    expect(out.map((g) => g.title)).toEqual(["Reel 12"]);
    expect(out[0].images.map((i) => i.id)).toEqual(["storyboard:a:s02"]);
  });

  it("keeps a whole group when its script title matches", () => {
    const out = filterStoryboardGroups(groups, "mango");
    expect(out.map((g) => g.title)).toEqual(["Mango launch"]);
    expect(out[0].images).toHaveLength(1);
  });

  it("drops every group when nothing matches", () => {
    expect(filterStoryboardGroups(groups, "zzz")).toEqual([]);
  });
});
