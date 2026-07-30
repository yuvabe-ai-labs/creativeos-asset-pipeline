import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { placeNextTo, imageGenGate, GUIDED_CHAIN, planGuidedNext } from "./guided-flow";

const node = (id: string, type: string, x = 0, y = 0, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type, position: { x, y }, data } as AppNode);
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

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

describe("GUIDED_CHAIN", () => {
  it("maps each pipeline source to its next type; video-gen is terminal", () => {
    expect(GUIDED_CHAIN.shot.nextType).toBe("prompt");
    expect(GUIDED_CHAIN.prompt.nextType).toBe("image-gen");
    expect(GUIDED_CHAIN["image-gen"].nextType).toBe("video-prompt");
    expect(GUIDED_CHAIN["video-prompt"].nextType).toBe("video-gen");
    expect(GUIDED_CHAIN["video-gen"]).toBeUndefined();
  });
});

describe("planGuidedNext", () => {
  it("returns null for a source with no chain entry", () => {
    expect(planGuidedNext(node("f", "file"), [], [])).toBeNull();
  });

  it("plans a fresh prompt from a shot, wiring the shot as the sole parent", () => {
    const shot = node("s", "shot", 0, 0);
    const plan = planGuidedNext(shot, [shot], [])!;
    expect(plan.nextType).toBe("prompt");
    expect(plan.existingId).toBeNull();
    expect(plan.parentIds).toEqual(["s"]);
    expect(plan.position).toEqual({ x: 360, y: 0 });
  });

  it("navigates to an existing next instead of duplicating", () => {
    const shot = node("s", "shot");
    const prompt = node("p", "prompt");
    const plan = planGuidedNext(shot, [shot, prompt], [edge("s", "p")])!;
    expect(plan.existingId).toBe("p");
    expect(plan.parentIds).toEqual([]);
  });

  it("wires BOTH the still and the shot into a new video-prompt", () => {
    const shot = node("s", "shot");
    const prompt = node("p", "prompt");
    const ig = node("ig", "image-gen", 0, 0, { parsed: "http://img", approvalStatus: "approved" });
    const edges = [edge("s", "p"), edge("p", "ig")];
    const plan = planGuidedNext(ig, [shot, prompt, ig], edges)!;
    expect(plan.nextType).toBe("video-prompt");
    expect(plan.parentIds.sort()).toEqual(["ig", "s"]); // still + shot ancestor
  });

  it("wires BOTH the motion prompt and the image-gen still into a new video-gen", () => {
    const ig = node("ig", "image-gen");
    const vp = node("vp", "video-prompt");
    const edges = [edge("ig", "vp")];
    const plan = planGuidedNext(vp, [ig, vp], edges)!;
    expect(plan.nextType).toBe("video-gen");
    expect(plan.parentIds.sort()).toEqual(["ig", "vp"]);
  });

  it("carries the image-gen gate (disabled without an image)", () => {
    const ig = node("ig", "image-gen");
    expect(planGuidedNext(ig, [ig], [])!.gate).toEqual({ enabled: false, nudge: "Generate an image first" });
  });
});
