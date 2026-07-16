import { describe, it, expect } from "vitest";
import { imageForShot, PLAYBOOKS, PLAYBOOK_NAMES, type RunContext } from "./playbooks";
import type { CanvasSnapshot, SlotValue } from "./playbooks";
import { resolveNodeTarget } from "./actions";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { AppNode } from "@/lib/canvas-nodes";

const n = (id: string, type: string, data: Record<string, unknown> = {}, x = 0, y = 0): AppNode =>
  ({ id, type, position: { x, y }, data }) as AppNode;
const snap = (nodes: AppNode[]): CanvasSnapshot => ({ nodes, edges: [] });

// A recording RunContext: recipes append to `calls`, remember writes `created`.
function fakeCtx(
  nodes: AppNode[],
  slots: Record<string, SlotValue>,
  created: Record<string, string> = {},
) {
  const calls = {
    created: [] as { type: string; position: { x: number; y: number } }[],
    connects: [] as { from: string[]; to: string }[],
    opened: [] as string[],
  };
  let seq = 0;
  const ctx: RunContext = {
    slots,
    created,
    remember: (k, id) => {
      created[k] = id;
    },
    resolve: (h) => resolveNodeTarget(nodes, h),
    node: (id) => nodes.find((x) => x.id === id) ?? null,
    recipes: {
      createNode: (type, position) => {
        calls.created.push({ type, position });
        return `made${seq++}xxx`; // handle-able: nodeHandle slices id chars
      },
      connect: (from, to) => {
        calls.connects.push({ from, to });
        return { wired: from, rejected: [], unknown: [] };
      },
      open: (id) => {
        calls.opened.push(id);
      },
    },
  };
  return { ctx, calls, created };
}

describe("registry", () => {
  it("exposes image-for-shot", () => {
    expect(PLAYBOOK_NAMES).toContain("image-for-shot");
    expect(PLAYBOOKS["image-for-shot"]).toBe(imageForShot);
  });
});

describe("image-for-shot slots", () => {
  const shotSlot = imageForShot.slots.find((s) => s.key === "shot")!;
  const refsSlot = imageForShot.slots.find((s) => s.key === "refs")!;

  it("shot is required and single; refs is multi and none-ok", () => {
    expect(shotSlot.required).toBe(true);
    expect(shotSlot.kind).toBe("node-handle");
    expect(refsSlot.kind).toBe("node-handles");
    expect(refsSlot.noneOk).toBe(true);
  });

  it("asks name the expected input format (copy discipline, spec §8)", () => {
    expect(shotSlot.ask).toContain("@");
    expect(refsSlot.ask.toLowerCase()).toContain("none");
  });

  it("infers the shot when exactly one shot exists (Ask-when-Needed)", () => {
    const one = n("aaaa1111-0000-0000-0000-000000000000", "shot");
    expect(shotSlot.infer!(snap([one, n("f1", "file")]))).toBe(nodeHandle(one));
    expect(shotSlot.infer!(snap([one, n("bbbb2222-0000-0000-0000-000000000000", "shot")]))).toBeNull();
  });

  it("shot is unanswerable on a shotless canvas, with a helpful message", () => {
    expect(shotSlot.unanswerable!(snap([n("f1", "file")]))).toMatch(/no shots/i);
    expect(shotSlot.unanswerable!(snap([n("s1", "shot")]))).toBeNull();
  });

  it("titles the run with the shot handle", () => {
    expect(imageForShot.title({ shot: "SHOT-1A2B" })).toBe("Image for SHOT-1A2B");
  });
});

describe("image-for-shot steps", () => {
  const shot = n("aaaa1111-0000-0000-0000-000000000000", "shot", {}, 100, 200);
  const shotH = nodeHandle(shot); // SHOT-AAAA
  const file = n("cccc3333-0000-0000-0000-000000000000", "file");
  const fileH = nodeHandle(file); // FILE-CCCC

  it("has the human generation gates at steps 4 and 6 (1-based)", () => {
    expect(imageForShot.steps.map((s) => s.actor)).toEqual([
      "copilot",
      "copilot",
      "copilot",
      "human",
      "copilot",
      "human",
    ]);
  });

  it("step 1 creates a prompt node right of the shot and remembers its id", () => {
    const { ctx, calls, created } = fakeCtx([shot, file], { shot: shotH, refs: [fileH] });
    const line = (imageForShot.steps[0] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.created).toEqual([{ type: "prompt", position: { x: 480, y: 200 } }]);
    expect(created.promptNodeId).toBe("made0xxx");
    expect(line).toContain("PRM-");
  });

  it("step 1 throws when the shot has vanished (run-time abort, spec §4)", () => {
    const { ctx } = fakeCtx([file], { shot: shotH, refs: [] });
    expect(() => (imageForShot.steps[0] as { run: (c: RunContext) => string }).run(ctx)).toThrow(
      /SHOT-AAAA/,
    );
  });

  it("step 2 connects shot + refs into the created prompt node", () => {
    const { ctx, calls } = fakeCtx(
      [shot, file],
      { shot: shotH, refs: [fileH] },
      { promptNodeId: "dddd4444-0000-0000-0000-000000000000" },
    );
    const line = (imageForShot.steps[1] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.connects).toEqual([{ from: [shotH, fileH], to: "PRM-DDDD" }]);
    expect(line).toContain("PRM-DDDD");
  });

  it("step 3 opens the prompt editor", () => {
    const { ctx, calls } = fakeCtx([shot], { shot: shotH, refs: [] }, { promptNodeId: "p1" });
    (imageForShot.steps[2] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.opened).toEqual(["p1"]);
  });

  it("step 4 done() is a level-triggered read of the prompt node's parsed", () => {
    const step = imageForShot.steps[3] as Extract<
      (typeof imageForShot.steps)[number],
      { actor: "human" }
    >;
    const run = { slots: {}, created: { promptNodeId: "p1" } };
    expect(step.done(snap([n("p1", "prompt", {})]), run)).toBe(false);
    expect(step.done(snap([n("p1", "prompt", { parsed: "  " })]), run)).toBe(false);
    expect(step.done(snap([n("p1", "prompt", { parsed: "a cinematic close-up" })]), run)).toBe(true);
    expect(step.watchId(run)).toBe("p1");
  });

  it("step 5 creates + wires + opens the image node in one step", () => {
    const prompt = n("dddd4444-0000-0000-0000-000000000000", "prompt", {}, 480, 200);
    const { ctx, calls, created } = fakeCtx(
      [shot, file, prompt],
      { shot: shotH, refs: [fileH] },
      { promptNodeId: prompt.id },
    );
    const line = (imageForShot.steps[4] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.created).toEqual([{ type: "image-gen", position: { x: 860, y: 200 } }]);
    expect(created.imageNodeId).toBe("made0xxx");
    expect(calls.connects[0].from).toEqual(["PRM-DDDD", fileH]);
    expect(calls.opened).toEqual(["made0xxx"]);
    expect(line).toContain("IMG-");
  });

  it("step 6 done() reads the image node's parsed; watches it", () => {
    const step = imageForShot.steps[5] as Extract<
      (typeof imageForShot.steps)[number],
      { actor: "human" }
    >;
    const run = { slots: {}, created: { imageNodeId: "i1" } };
    expect(step.done(snap([n("i1", "image-gen", {})]), run)).toBe(false);
    expect(step.done(snap([n("i1", "image-gen", { parsed: "https://x/y.png" })]), run)).toBe(true);
    expect(step.watchId(run)).toBe("i1");
  });
});
