import { describe, it, expect } from "vitest";
import {
  missingSlots,
  applyInference,
  resolveSlotReply,
  nextAction,
  normalizeSlots,
  type PlaybookRun,
} from "./runner";
import { imageForShot } from "./playbooks";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { AppNode } from "@/lib/canvas-nodes";

const n = (id: string, type: string): AppNode =>
  ({ id, type, position: { x: 0, y: 0 }, data: {} }) as AppNode;

const baseRun = (over: Partial<PlaybookRun>): PlaybookRun => ({
  playbook: "image-for-shot",
  title: "Image for SHOT-AAAA",
  slots: {},
  created: {},
  stepIndex: 0,
  status: "running",
  log: [],
  ...over,
});

describe("missingSlots", () => {
  it("lists required slots with no value, in playbook order", () => {
    expect(missingSlots(imageForShot, {}).map((s) => s.key)).toEqual(["shot", "refs"]);
    expect(missingSlots(imageForShot, { shot: "SHOT-1A2B" }).map((s) => s.key)).toEqual(["refs"]);
  });
  it("an empty array IS a value ('none' was the answer)", () => {
    expect(missingSlots(imageForShot, { shot: "SHOT-1A2B", refs: [] })).toEqual([]);
  });
});

describe("applyInference", () => {
  const shot = n("aaaa1111-0000-0000-0000-000000000000", "shot");
  it("fills an inferable slot (one shot on canvas → it's the shot)", () => {
    const out = applyInference(imageForShot, {}, { nodes: [shot], edges: [] });
    expect(out.shot).toBe(nodeHandle(shot));
  });
  it("does not override a provided value and does not infer when ambiguous", () => {
    const two = [shot, n("bbbb2222-0000-0000-0000-000000000000", "shot")];
    expect(applyInference(imageForShot, { shot: "SHOT-BBBB" }, { nodes: two, edges: [] }).shot).toBe(
      "SHOT-BBBB",
    );
    expect(applyInference(imageForShot, {}, { nodes: two, edges: [] }).shot).toBeUndefined();
  });
});

describe("resolveSlotReply", () => {
  const shotSlot = imageForShot.slots[0];
  const refsSlot = imageForShot.slots[1];
  const shot = n("aaaa1111-0000-0000-0000-000000000000", "shot");
  const file = n("cccc3333-0000-0000-0000-000000000000", "file");
  const draw = n("dddd4444-0000-0000-0000-000000000000", "draw");

  it("resolves an @-mention client-side — zero model calls", () => {
    const h = nodeHandle(shot);
    expect(resolveSlotReply(`use @${h}`, shotSlot, [shot])).toEqual({ kind: "filled", value: h });
  });
  it("collects multiple mentions for a multi slot", () => {
    const reply = `@${nodeHandle(file)} and @${nodeHandle(draw)}`;
    expect(resolveSlotReply(reply, refsSlot, [file, draw])).toEqual({
      kind: "filled",
      value: [nodeHandle(file), nodeHandle(draw)],
    });
  });
  it('"none"/"skip"/"nothing" fills a none-ok slot with []', () => {
    for (const word of ["none", "None.", " skip ", "nothing"]) {
      expect(resolveSlotReply(word, refsSlot, [])).toEqual({ kind: "filled", value: [] });
    }
  });
  it('"none" on a NOT-none-ok slot falls through to the model', () => {
    expect(resolveSlotReply("none", shotSlot, [])).toEqual({ kind: "model" });
  });
  it("free text falls through to the model", () => {
    expect(resolveSlotReply("the one with the coffee cup", refsSlot, [file])).toEqual({
      kind: "model",
    });
  });
});

describe("nextAction", () => {
  it("copilot step → run-step; human step → wait-human; past the end → done", () => {
    expect(nextAction(imageForShot, baseRun({ stepIndex: 0 })).kind).toBe("run-step");
    expect(nextAction(imageForShot, baseRun({ stepIndex: 3 })).kind).toBe("wait-human");
    expect(nextAction(imageForShot, baseRun({ stepIndex: 6 })).kind).toBe("done");
  });
});

describe("normalizeSlots", () => {
  it("keeps trimmed strings and string arrays, drops junk", () => {
    expect(
      normalizeSlots({ shot: " SHOT-1A2B ", refs: [" FILE-08F1", 3, ""], n: 42, o: {}, e: "  " }),
    ).toEqual({ shot: "SHOT-1A2B", refs: ["FILE-08F1"] });
  });
  it("returns {} for non-objects", () => {
    expect(normalizeSlots(null)).toEqual({});
    expect(normalizeSlots("x")).toEqual({});
  });
});
