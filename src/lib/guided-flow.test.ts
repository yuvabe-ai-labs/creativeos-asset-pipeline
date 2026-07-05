import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { placeNextTo, imageGenGate } from "./guided-flow";

const node = (id: string, type: string, x = 0, y = 0, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type, position: { x, y }, data } as AppNode);

describe("placeNextTo", () => {
  it("drops the next node to the right of the source", () => {
    const src = node("s", "shot", 100, 200);
    expect(placeNextTo(src, [src])).toEqual({ x: 460, y: 200 });
  });

  it("nudges down when the spot is occupied", () => {
    const src = node("s", "shot", 100, 200);
    const blocker = node("b", "prompt", 460, 200); // sits exactly at the default target
    expect(placeNextTo(src, [src, blocker]).y).toBeGreaterThan(200);
  });
});

describe("imageGenGate", () => {
  it("is disabled with a nudge when there is no image yet", () => {
    expect(imageGenGate(node("g", "image-gen"))).toEqual({ enabled: false, nudge: "Generate an image first" });
  });

  it("is enabled with a nudge when the image is not approved", () => {
    const g = node("g", "image-gen", 0, 0, { parsed: "http://img", approvalStatus: "pending" });
    expect(imageGenGate(g)).toEqual({ enabled: true, nudge: "Not approved yet" });
  });

  it("is cleanly enabled once approved", () => {
    const g = node("g", "image-gen", 0, 0, { parsed: "http://img", approvalStatus: "approved" });
    expect(imageGenGate(g)).toEqual({ enabled: true });
  });
});
