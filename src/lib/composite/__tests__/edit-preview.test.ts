import { describe, it, expect } from "vitest";
import { compositeEditPreview } from "../edit-preview";
import type { CompositeUpstreamItem } from "../upstream-items";

const ITEMS: CompositeUpstreamItem[] = [
  { id: "av", type: "avatar", label: "Riya", fileUrl: "https://cdn/front.png", fileKind: "image" },
  { id: "f", type: "file", label: "Sandals.png", fileUrl: "https://cdn/s.png", fileKind: "image" },
  { id: "g", type: "image-gen", label: "Hero", fileUrl: "https://cdn/g.png", fileKind: "image" },
];

describe("compositeEditPreview (D312)", () => {
  it("numbers ticked and mentioned references after the picture being edited, in input order", () => {
    const p = compositeEditPreview({
      items: ITEMS,
      selectedIds: ["g"],
      instruction: "@[File: Sandals.png](f) in his hand",
      intent: "add",
      hasAvatar: true,
    });
    expect(p).toContain("Image 2: Sandals.png.");
    expect(p).toContain("Image 3: Hero.");
    expect(p).toContain("Sandals.png (image 2) in his hand");
    expect(p).toMatch(/same face/);
  });

  it("is empty until there is something to change", () => {
    expect(compositeEditPreview({ items: ITEMS, selectedIds: [], instruction: "  ", intent: "freeform", hasAvatar: false })).toBe("");
  });
});
