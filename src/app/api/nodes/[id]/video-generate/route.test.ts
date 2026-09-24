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
  getVoicesCached: vi.fn(async () => [
    { voiceId: "v1", name: "Priya", category: "cloned", previewUrl: null },
  ]),
  signVideoGenVoiceUrls: vi.fn(async () => ({
    originalPutUrl: "https://put/o",
    originalUrl: "https://storage.googleapis.com/b/o.mp4",
    revoicedPutUrl: "https://put/r",
    revoicedUrl: "https://storage.googleapis.com/b/r.mp4",
  })),
}));

// D236 — `targetModel` is the MULTISHOT NODE's current setting; `planTargetModel` is the stamp on
// the plan itself, which is what every guard actually reads. They default to the same value
// because that is the state a freshly generated plan is in; the divergence tests pass them apart
// on purpose, which is the whole point of the stamp. `null` = an unstamped plan, i.e. one written
// before the stamp existed — which means Gemini Omni.
function buildGraph(
  cuts: MultishotCut[],
  targetModel: string,
  plan: MultishotPlan,
  planTargetModel: string | null = targetModel,
): Record<string, Row[]> {
  const stampedPlan: MultishotPlan =
    planTargetModel === null ? plan : { ...plan, targetModel: planTargetModel };
  return {
    vg: [
      { nodeId: "mp", type: "multishot-prompt", data: {}, activeOutput: stampedPlan, versionId: "v1" },
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

vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoicesCached: mocks.getVoicesCached }));
vi.mock("@/lib/storage", () => ({ signVideoGenVoiceUrls: mocks.signVideoGenVoiceUrls }));

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

  // D236 — THE GUARD READS THE PLAN'S STAMP, NOT THE MULTISHOT NODE'S FIELD.
  //
  // The operator wrote an Omni plan, then switched the Multishot node's Select to Kling. Every
  // client surface coerces off the same stamp and so offers Gemini Omni, but the request under
  // test names Kling — the state a stale tab, a replayed request or a pre-fix client produces.
  // Reading the node here let it through: Kling generated and billed a payload whose beats hold
  // Omni's `<IMAGE_REF_N>` tokens as literal prose, with the reference never bound. Rejected
  // before insertGeneration and reserveCredits, so it costs nothing.
  it("rejects a request for the model the NODE now names when the PLAN was stamped for the other", async () => {
    mocks.graph = buildGraph(
      LEGAL_KLING_CUTS,
      KLING_OMNI_MODEL_ID, // the node was switched to Kling…
      PLAN,
      GEMINI_OMNI_MODEL_ID, // …after this plan had already been written by Omni's writer
    );

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Gemini Omni 1.1");
    expect(json.error).not.toContain("Kling 3.0 Omni");

    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  // The same divergence for an UNSTAMPED plan — every plan written before the stamp existed. The
  // fallback is the DEFAULT (Gemini Omni), never the node's current field, so these old plans are
  // migrated by construction rather than by a backfill.
  it("treats an unstamped plan as Omni's and rejects a Kling request, whatever the node says", async () => {
    mocks.graph = buildGraph(LEGAL_KLING_CUTS, KLING_OMNI_MODEL_ID, PLAN, null);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Gemini Omni 1.1");
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  // The Omni lane end to end — there was no route-level test of it at all, so nothing pinned that
  // an Omni-stamped plan reaches the provider as Omni's cumulative ladder with the ladder's own
  // duration, and without Kling's `multi_shot` field (Omni declares no such param).
  it("generates the OMNI lane on the plan's own model, with the ladder's duration", async () => {
    // 3 + 5 = 8s, inside Omni's 3-10s window.
    const omniCuts: MultishotCut[] = [
      { id: "c1", text: "keys", seconds: 3 },
      { id: "c2", text: "cab", seconds: 5 },
    ];
    mocks.graph = buildGraph(omniCuts, GEMINI_OMNI_MODEL_ID, PLAN);

    const res = await post({
      modelId: GEMINI_OMNI_MODEL_ID,
      params: { duration: 5 },
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(202);
    const [, payload] = mocks.triggerTask.mock.calls[0] as [
      string,
      { params: Record<string, unknown>; prompt: string },
    ];
    expect(payload.params.duration).toBe(8);
    expect(payload.prompt).toContain("[0-3s]");
    expect(payload.prompt).not.toContain("shot 1, ");
    expect(payload.params.multi_shot).toBeUndefined();
  });

  // D279 — the hole this closes: renderPlan and checkPlanLimits both resolve a missing beat to
  // "", so a cut the plan does not cover renders as an EMPTY SHOT, passes every character
  // budget, and is billed. Adding a shot on the Multishot node is the first route that can
  // produce this while the prompt node stays connected.
  it("rejects a ladder the plan does not cover, before any generation is recorded", async () => {
    const threeCuts: MultishotCut[] = [
      { id: "c1", text: "keys", seconds: 5 },
      { id: "c2", text: "cab", seconds: 7 },
      { id: "c3", text: "a shot added after the prompt was written", seconds: 2 },
    ];
    mocks.graph = buildGraph(threeCuts, KLING_OMNI_MODEL_ID, PLAN); // PLAN covers c1 and c2 only

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(
      "Shot 3 has no written prompt. Re-generate the Multishot Prompt, or write that shot.",
    );

    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("names the FIRST uncovered shot when several are uncovered", async () => {
    const fourCuts: MultishotCut[] = [
      { id: "c1", text: "keys", seconds: 4 },
      { id: "cX", text: "added", seconds: 2 },
      { id: "c2", text: "cab", seconds: 4 },
      { id: "cY", text: "also added", seconds: 2 },
    ];
    mocks.graph = buildGraph(fourCuts, KLING_OMNI_MODEL_ID, PLAN);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    const json = await res.json();
    expect(json.error).toContain("Shot 2");
    expect(json.error).not.toContain("Shot 4");
  });

  // An orphaned beat alone is NOT an error — renderPlan walks the cuts, so it is never rendered.
  // Asserted explicitly so a later tightening to parsePlan cannot silently start refusing it.
  it("still generates when the plan carries a beat whose cut was removed", async () => {
    const planWithOrphan: MultishotPlan = {
      ...PLAN,
      beats: [...PLAN.beats, { cutId: "c-removed", text: "a shot that no longer exists" }],
    };
    mocks.graph = buildGraph(LEGAL_KLING_CUTS, KLING_OMNI_MODEL_ID, planWithOrphan);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(202);
    expect(mocks.triggerTask).toHaveBeenCalledTimes(1);
  });
});

import { videoGenRegistry } from "@/lib/video-gen/registry";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";

// A single-take video-prompt lane: vg <- vp (string prompt). No images.
function simpleGraph(): Record<string, Row[]> {
  return {
    vg: [{ nodeId: "vp", type: "video-prompt", data: {}, activeOutput: "A hand lifts keys.", versionId: "v9" }],
    vp: [],
  };
}

const AUDIO_MODEL_ID = Object.values(videoGenRegistry).find((m) =>
  m.params.some((p) => p.name === "audio"),
)!.id;

describe("POST video-generate — voice change (D282)", () => {
  it("rejects a voice when the model's audio is off, before recording anything", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: AUDIO_MODEL_ID, params: { audio: "off" }, voiceId: "v1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Audio/);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("rejects a voice that isn't on the ElevenLabs account", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "gone" });
    expect(res.status).toBe(400);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("rejects a voice when the ElevenLabs key is missing", async () => {
    mocks.graph = simpleGraph();
    mocks.getVoicesCached.mockRejectedValueOnce(new ElevenLabsKeyMissingError());
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ELEVEN_LABS_API_KEY/);
  });

  it("reserves video + voice and sends the voice payload to the task", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1" });
    expect(res.status).toBe(202);

    const payload = mocks.triggerTask.mock.calls[0][1] as unknown as {
      params: Record<string, unknown>;
      voice: Record<string, string>;
    };
    expect(payload.voice).toEqual({
      voiceId: "v1",
      voiceName: "Priya",
      originalPutUrl: "https://put/o",
      originalUrl: "https://storage.googleapis.com/b/o.mp4",
      revoicedPutUrl: "https://put/r",
      revoicedUrl: "https://storage.googleapis.com/b/r.mp4",
    });
    expect(mocks.signVideoGenVoiceUrls).toHaveBeenCalledWith({ nodeId: "vg", generationId: "gen-1" });

    const p = payload.params;
    const duration = Number(p.seconds ?? p.duration ?? 0);
    const video = computeVideoCost(
      GEMINI_OMNI_MODEL_ID,
      duration,
      isVideoAudioEnabled(p.audio),
      asResolutionString(p.resolution),
    )!;
    expect(mocks.reserveCredits).toHaveBeenCalledWith(
      "org-1",
      "gen-1",
      usdToFinalCredits(video.usd + computeVoiceChangeCost(duration).usd),
    );
  });

  it("ignores the voice in mock mode and leaves the payload unchanged", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1", mock: true });
    expect(res.status).toBe(202);
    expect(mocks.getVoicesCached).not.toHaveBeenCalled();
    expect(mocks.triggerTask.mock.calls[0][1]).not.toHaveProperty("voice");
  });

  it("sends no voice key at all when none is selected", async () => {
    mocks.graph = simpleGraph();
    await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {} });
    expect(mocks.triggerTask.mock.calls[0][1]).not.toHaveProperty("voice");
    expect(mocks.signVideoGenVoiceUrls).not.toHaveBeenCalled();
  });
});
