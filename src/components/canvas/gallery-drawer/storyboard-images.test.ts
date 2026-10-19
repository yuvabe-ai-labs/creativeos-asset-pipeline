import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { storyboardGroups } from "./storyboard-images";

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
