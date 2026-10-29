import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/canvas/gallery-drawer-context", () => ({ useGalleryDrawer: () => ({}) }));

import { placeQuickAddMenu } from "./quick-add-menu";

const size = { width: 240, height: 640 };
const laptop = { width: 1366, height: 768 };

// YUV-391 — the palette stays whole on screen wherever the right-click lands.
describe("placeQuickAddMenu", () => {
  it("opens at the pointer when it fits", () => {
    expect(placeQuickAddMenu({ x: 100, y: 50 }, size, { width: 1920, height: 1080 })).toEqual({ left: 100, top: 50, maxHeight: 640 });
  });

  it("near the top of a short window, stays below the top edge instead of flipping off it", () => {
    const p = placeQuickAddMenu({ x: 400, y: 200 }, size, laptop);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(laptop.height - 8);
  });

  it("flips left at the right edge and never leaves the window", () => {
    const p = placeQuickAddMenu({ x: 1350, y: 700 }, size, laptop);
    expect(p.left).toBe(1350 - 240);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });

  it("on a window shorter than the menu, takes the window's height", () => {
    const p = placeQuickAddMenu({ x: 10, y: 10 }, size, { width: 1280, height: 500 });
    expect(p).toMatchObject({ top: 8, maxHeight: 484 });
  });
});
