import { describe, it, expect } from "vitest";
import { mentionChipLookup } from "../mention-chip-lookup";

describe("mentionChipLookup", () => {
  it("keeps a mentionable's image so its chip shows a thumbnail (D312)", () => {
    const map = mentionChipLookup([], [
      { id: "av", label: "Avatar: Riya", type: "avatar", fileUrl: "https://cdn/front.png", fileKind: "image" },
    ]);
    expect(map.get("av")).toMatchObject({ fileUrl: "https://cdn/front.png", fileKind: "image", label: "Avatar: Riya" });
  });

  it("keeps an upstream entry's own fields when a mentionable relabels it", () => {
    const map = mentionChipLookup(
      [{ id: "f", label: "Sandals.png", type: "file", fileUrl: "https://cdn/s.png", fileKind: "image", useLlm: false }],
      [{ id: "f", label: "File: Sandals.png", type: "file" }],
    );
    expect(map.get("f")).toMatchObject({ label: "File: Sandals.png", fileUrl: "https://cdn/s.png", useLlm: false });
  });

  it("a refine note's mentionables (no image, not upstream) still resolve", () => {
    const map = mentionChipLookup([], [{ id: "look", label: "The look", type: "plan" }]);
    expect(map.get("look")).toEqual({ id: "look", label: "The look", type: "plan" });
  });
});
