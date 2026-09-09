import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { checkLadder, multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import { KLING_OMNI_MODEL_ID, GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

vi.mock("server-only", () => ({}));

// withNode hands the handler (nodeId, node, caller, clientId, orgId) once auth has passed — same
// bypass multishot-prompt/route.test.ts uses, since real withNode needs a live Supabase mock and
// this route's own logic (the D236/D97 guards) is what's under test, not the auth wrapper.
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>(
    "@/lib/api/route-helpers",
  );
  return {
    ...actual,
    withNode: (
      req: Request,
      _params: unknown,
      fn: (
        nodeId: string,
        node: unknown,
        caller: { userId: string; email: string },
        clientId: string,
        orgId: string,
      ) => Promise<Response>,
    ) => fn("vg", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

// The upstream graph under test: video-gen "vg" <- multishot-prompt "mp" <- { image-gen "ig" (a
// reference image), multishot "ms" (the cut list + targetModel) }. Same shape as the GRAPH in
// upstream-images/route.test.ts, which this file follows as its harness pattern.
type Row = {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
  versionId: string | null;
};

// `import { POST } from "./route"` below is a real ES import, and ES imports execute before any
// other top-level statement in the module regardless of where they're written — so every mock
// fn a `vi.mock` factory closes over must be created via `vi.hoisted`, not a plain `const`, or
// route.ts's own transitive imports run before that `const` initializes ("Cannot access before
// initialization").
const mocks = vi.hoisted(() => ({
  graph: {} as Record<string, Row[]>,
  insertGeneration: vi.fn(async () => ({ id: "gen-1" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  triggerTask: vi.fn(async (_taskId: string, _payload: { params: Record<string, unknown> }) => ({
    id: "run-1",
  })),
}));

function buildGraph(cuts: MultishotCut[], targetModel: string, plan: MultishotPlan): Record<string, Row[]> {
  return {
    vg: [
      { nodeId: "mp", type: "multishot-prompt", data: {}, activeOutput: plan, versionId: "v1" },
    ],
    mp: [
      { nodeId: "ig", type: "image-gen", data: {}, activeOutput: "https://img.example/ref.png", versionId: "v2" },
      { nodeId: "ms", type: "multishot", data: { cuts, targetModel }, activeOutput: null, versionId: null },
    ],
  };
}

vi.mock("@/lib/db/nodes", () => ({
  getUpstreamOutputs: vi.fn(async (nodeId: string) => mocks.graph[nodeId] ?? []),
}));

vi.mock("@/lib/db/generations", () => ({
  insertGeneration: mocks.insertGeneration,
  failGeneration: mocks.failGeneration,
}));

vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: mocks.reserveCredits,
  refundReservation: mocks.refundReservation,
  CreditLimitError: class CreditLimitError extends Error {},
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  tasks: { trigger: mocks.triggerTask },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(new Request("http://x/api/nodes/vg/video-generate", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "vg" }),
  });
}

const PLAN: MultishotPlan = {
  version: 1,
  look: "Warm low sun from camera-left.",
  beats: [
    { cutId: "c1", text: "Tight on a hand lifting keys." },
    { cutId: "c2", text: "A cab door swings open." },
  ],
};

// Legal on Kling 3.0 Omni: 2 cuts, total 12s (window is 3-15s).
const LEGAL_KLING_CUTS: MultishotCut[] = [
  { id: "c1", text: "keys", seconds: 5 },
  { id: "c2", text: "cab", seconds: 7 },
];

// Illegal on Kling 3.0 Omni: total 18s, over the 15s ceiling.
const ILLEGAL_KLING_CUTS: MultishotCut[] = [
  { id: "c1", text: "keys", seconds: 9 },
  { id: "c2", text: "cab", seconds: 9 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.graph = {};
});

describe("POST video-generate — multishot server backstop (D236, D97)", () => {
  it("rejects a modelId that differs from the plan's targetModel, before any generation is recorded", async () => {
    mocks.graph = buildGraph(LEGAL_KLING_CUTS, KLING_OMNI_MODEL_ID, PLAN);

    const res = await post({
      // The plan was written for Kling 3.0 Omni; this request names the other multishot model.
      modelId: GEMINI_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Kling 3.0 Omni");

    // The whole point of where this guard sits: a rejected request must not reach
    // insertGeneration/reserveCredits, so no generation row and no credit reservation are ever
    // created for a request built on the wrong contract.
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("rejects a ladder illegal for the target model, with checkLadder's own reason text", async () => {
    mocks.graph = buildGraph(ILLEGAL_KLING_CUTS, KLING_OMNI_MODEL_ID, PLAN);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(400);
    const json = await res.json();

    // Computed from checkLadder itself (not re-typed here) so this assertion can't drift from the
    // one sentence multishot-models.ts says is shown on every surface, including this one.
    const cap = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
    const expected = checkLadder(ILLEGAL_KLING_CUTS, cap);
    expect(expected.ok).toBe(false);
    expect(json.error).toBe(expected.ok ? "" : expected.reason);

    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("bills totalOf(cuts) as duration, not the node's own stale duration param", async () => {
    mocks.graph = buildGraph(LEGAL_KLING_CUTS, KLING_OMNI_MODEL_ID, PLAN);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      // The node's own param, left at Kling's default — stale next to a 12s ladder.
      params: { duration: 5 },
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(202);
    expect(mocks.triggerTask).toHaveBeenCalledTimes(1);

    // Assert on the actual payload handed to the trigger call, not on a mock configuration.
    const [taskName, payload] = mocks.triggerTask.mock.calls[0];
    expect(taskName).toBe("video-generate");
    expect(payload.params.duration).toBe(12); // totalOf(LEGAL_KLING_CUTS) = 5 + 7
    expect(payload.params.duration).not.toBe(5);
  });
});
