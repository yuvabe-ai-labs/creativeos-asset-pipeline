import { describe, it, expect } from "vitest";
import { boardText, type BoardFacts } from "../board-text";

const facts = (over: Partial<BoardFacts> = {}): BoardFacts => ({
  shots: [
    { id: "s01", label: "S1", panel: "ready", versions: 2, picked: 2 },
    { id: "s02", label: "S2", panel: "not_yet", versions: 0, picked: null },
  ],
  castWithoutAvatar: [], withoutPicture: [], ...over,
});

describe("boardText", () => {
  it("writes one line per shot with its panel, versions and pick", () => {
    expect(boardText(facts()).split("\n").slice(0, 2)).toEqual([
      "S1 (id s01): panel ready, 2 versions, version 2 picked",
      "S2 (id s02): no panel yet",
    ]);
  });

  it("names every panel state in words", () => {
    const shot = (panel: BoardFacts["shots"][number]["panel"]) => ({ id: "s1", label: "S1", panel, versions: 1, picked: 1 });
    const line = (panel: BoardFacts["shots"][number]["panel"]) => boardText(facts({ shots: [shot(panel)] })).split("\n")[0];
    expect(line("out_of_date")).toBe("S1 (id s1): panel out of date, 1 version, version 1 picked");
    expect(line("failed")).toBe("S1 (id s1): the last draw failed, 1 version, version 1 picked");
    expect(line("drawing")).toBe("S1 (id s1): being drawn, 1 version, version 1 picked");
    expect(line("waiting")).toBe("S1 (id s1): waiting for an avatar, 1 version, version 1 picked");
  });

  it("lists who has no avatar and what has no picture", () => {
    const text = boardText(facts({ castWithoutAvatar: ["Meenakshi"], withoutPicture: ["the café (location)"] }));
    expect(text).toContain("Characters with no avatar ready to draw: Meenakshi");
    expect(text).toContain("Locations and products with no picture: the café (location)");
  });

  it("says when nothing is missing", () => {
    const text = boardText(facts());
    expect(text).toContain("Every character on screen has an avatar ready to draw.");
    expect(text).toContain("Every location and product has a picture.");
  });
});
