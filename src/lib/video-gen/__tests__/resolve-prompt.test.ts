import { describe, it, expect } from "vitest";
import { resolveVideoGenPrompt } from "../resolve-prompt";
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";

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

