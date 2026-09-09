import { describe, it, expect } from "vitest";
import { resolveVideoGenPrompt } from "../resolve-prompt";
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { KLING_OMNI_MODEL_ID, GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";

function output(partial: Partial<UpstreamOutput> & { nodeId: string; type: string }): UpstreamOutput {
  return {
    data: {},
    activeOutput: null,
    versionId: null,
    ...partial,
  };
}

const cuts: MultishotCut[] = [
  { id: "cut-1", text: "wide shot of the product", seconds: 3 },
  { id: "cut-2", text: "close-up on the label", seconds: 5 },
];

const plan: MultishotPlan = {
  version: 1,
  look: "warm morning light, handheld",
  beats: [
    { cutId: "cut-1", text: "The bottle sits on a marble counter." },
    { cutId: "cut-2", text: "Steam rises past the label." },
  ],
};

describe("resolveVideoGenPrompt", () => {
  it("resolves a video-prompt upstream to its string output", async () => {
    const videoPromptNode = output({
      nodeId: "vp-1",
      type: "video-prompt",
      activeOutput: "Slow dolly in on the product.",
    });
    const result = await resolveVideoGenPrompt([videoPromptNode], async () => []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt).toBe("Slow dolly in on the product.");
      expect(result.cuts).toBeNull();
    }
  });

  it("rejects a video-prompt node with no output rather than sending an empty prompt", async () => {
    const videoPromptNode = output({ nodeId: "vp-1", type: "video-prompt", activeOutput: null });
    const result = await resolveVideoGenPrompt([videoPromptNode], async () => []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/video-prompt/);
  });

  it("resolves a multishot-prompt upstream via renderPlan(plan, cuts), never String(activeOutput)", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: plan,
    });
    const multishotNode = output({ nodeId: "m-1", type: "multishot", data: { cuts } });

    const result = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt).not.toBe("[object Object]");
      expect(result.prompt).toContain("warm morning light, handheld");
      expect(result.prompt).toContain("[0-3s] The bottle sits on a marble counter.");
      expect(result.prompt).toContain("[3-8s] Steam rises past the label.");
      expect(result.cuts).toEqual(cuts);
      expect(result.targetModel).toBeNull();
    }
  });

  // D236 — the format comes from the PLAN's own stamp. The Multishot node here still says the
  // default (Omni), and the Kling-stamped plan must still render as Kling triples: what was
  // written is what ships.
  it("renders Kling triples for a Kling-stamped plan", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: { ...plan, targetModel: KLING_OMNI_MODEL_ID },
    });
    const multishotNode = output({ nodeId: "m-1", type: "multishot", data: { cuts } });

    const res = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.targetModel).toBe(KLING_OMNI_MODEL_ID);
      expect(res.prompt).toContain("shot 1, ");
      expect(res.prompt).not.toContain("[0-");
    }
  });

  // THE REGRESSION THIS STAMP EXISTS FOR. An Omni plan whose beats hold `<IMAGE_REF_0>`, on a
  // Multishot node the operator has since switched to Kling. Reading the NODE here rendered those
  // beats as Kling triples with Omni's token sitting inside them as literal prose: refsCitedIn
  // found nothing, checkPlanLimits passed, the route's model guard passed (it compares against
  // this same field), and Kling generated and BILLED with the reference never bound.
  //
  // The plan is unstamped, which is every plan written before the stamp existed — and the fallback
  // for that is the DEFAULT (Gemini Omni), never the node's current field. That fallback IS the
  // migration.
  it("renders an UNSTAMPED plan as Omni even when the Multishot node says Kling", async () => {
    const omniPlanWithRef: MultishotPlan = {
      version: 1,
      look: "warm morning light, handheld",
      beats: [
        { cutId: "cut-1", text: "The bottle from <IMAGE_REF_0> sits on a marble counter." },
        { cutId: "cut-2", text: "Steam rises past the label." },
      ],
    };
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: omniPlanWithRef,
    });
    // The operator switched the Select AFTER the plan was written.
    const multishotNode = output({
      nodeId: "m-1",
      type: "multishot",
      data: { cuts, targetModel: KLING_OMNI_MODEL_ID },
    });

    const res = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Omni's cumulative ladder, not Kling's triples.
    expect(res.prompt).toContain("[0-3s]");
    expect(res.prompt).not.toContain("shot 1, ");
    // And the model reported back is Omni's, so video-generate/route.ts rejects a Kling modelId
    // instead of generating on the wrong contract.
    expect(res.targetModel).toBeNull();
    expect(multishotCapabilityFor(res.targetModel).id).toBe(GEMINI_OMNI_MODEL_ID);
  });

  // The mirror image: an Omni-stamped plan on a node still set to Omni. Same output, but this one
  // pins that an explicit stamp is honoured rather than merely ignored.
  it("renders an OMNI-stamped plan as Omni even when the Multishot node says Kling", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: { ...plan, targetModel: GEMINI_OMNI_MODEL_ID },
    });
    const multishotNode = output({
      nodeId: "m-1",
      type: "multishot",
      data: { cuts, targetModel: KLING_OMNI_MODEL_ID },
    });

    const res = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.targetModel).toBe(GEMINI_OMNI_MODEL_ID);
      expect(res.prompt).toContain("[0-");
      expect(res.prompt).not.toContain("shot 1, ");
    }
  });

  it("falls back to Omni's ladder when the plan carries no stamp", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: plan,
    });
    const multishotNode = output({ nodeId: "m-1", type: "multishot", data: { cuts } });

    const res = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.targetModel).toBeNull();
      expect(res.prompt).toContain("[0-");
    }
  });

  it("rejects a multishot-prompt whose upstream Multishot node cannot be found, instead of stringifying the plan", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: plan,
    });

    // No multishot node upstream at all.
    const result = await resolveVideoGenPrompt([multishotPromptNode], async () => []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toBe("[object Object]");
      expect(result.reason).toMatch(/multishot/i);
    }
  });

  it("rejects a multishot-prompt whose Multishot node has no valid cuts", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: plan,
    });
    const multishotNode = output({ nodeId: "m-1", type: "multishot", data: { cuts: [] } });

    const result = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a multishot-prompt with no generated plan yet", async () => {
    const multishotPromptNode = output({
      nodeId: "mp-1",
      type: "multishot-prompt",
      activeOutput: null,
    });
    const result = await resolveVideoGenPrompt([multishotPromptNode], async () => []);
    expect(result.ok).toBe(false);
  });

  it("names both possible prompt node types when neither is connected", async () => {
    const result = await resolveVideoGenPrompt(
      [output({ nodeId: "x-1", type: "image-gen" })],
      async () => [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/video-prompt/);
      expect(result.reason).toMatch(/multishot-prompt/);
    }
  });
});

