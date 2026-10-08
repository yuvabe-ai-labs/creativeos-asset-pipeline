import { describe, it, expect, vi, beforeEach } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import type { CompositeRef } from "@/lib/composite/references";

vi.mock("server-only", () => ({}));

const stored = { instruction: "" };
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("node-1", { data: stored }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

const AVATAR_REF: CompositeRef = { nodeId: "n-av", name: "Riya", role: "avatar", position: 1, image: { url: "https://cdn/front.png" } };
const SHEET_REF: CompositeRef = { nodeId: "n-av:sheet", name: "Riya sheet", role: "avatar-sheet", position: 2, image: { url: "https://cdn/sheet.png" } };
const FILE_REF: CompositeRef = { nodeId: "n-file", name: "Sandals.png", role: "image", position: 3, image: { url: "https://cdn/sandals.png" } };
const loadCompositeInputs = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({}) as unknown);
vi.mock("@/lib/composite/load-inputs", () => ({ loadCompositeInputs: (...a: unknown[]) => loadCompositeInputs(...a) }));

// vi.mock factories are hoisted above every const; the registry factory CALLS `model`, so both
// live in vi.hoisted.
const { generate, model } = vi.hoisted(() => {
  const generate = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({}) as unknown);
  const model = (label: string, maxReferenceImages: number) => ({
    label,
    maxReferenceImages,
    maxReferenceSizeBytes: 0,
    schema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    generate: (...a: unknown[]) => generate(...a),
  });
  return { generate, model };
});
vi.mock("@/lib/image-gen/registry", () => ({
  imageGenRegistry: {
    "seedream:seedream-5-0-lite": model("Seedream 5.0 Lite", 14),
    "gemini:gemini-3-pro-image": model("Nano Banana Pro", 14),
    "tiny:two": model("Tiny", 2),
    "openai:gpt-image-2": { ...model("GPT Image 2", 16), supportsMask: true },
  },
}));

vi.mock("@/lib/image-gen/estimate", () => ({ estimateImageGenerationCostUsd: () => 0.03 }));
vi.mock("@/lib/image-gen/cost", () => ({ computeImageCost: () => ({ usd: 0.03 }) }));
vi.mock("@/lib/storage", () => ({ uploadImageGen: vi.fn(async () => ({ url: "https://cdn/out.png" })) }));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 1152, height: 2048 }) }) }));

// Every mock takes `...a: unknown[]` so `mock.calls[0][0]` is typed and tsc stays clean.
const insertVersion = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ id: "v1" }));
const getVersionById = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null);
vi.mock("@/lib/db/versions", () => ({
  insertVersion: (...a: unknown[]) => insertVersion(...a),
  setActiveVersion: vi.fn(async () => undefined),
  getVersionById: (...a: unknown[]) => getVersionById(...a),
}));
const insertGeneration = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ id: "g1" }));
const failGeneration = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => undefined);
vi.mock("@/lib/db/generations", () => ({
  insertGeneration: (...a: unknown[]) => insertGeneration(...a),
  succeedGeneration: vi.fn(async () => undefined),
  failGeneration: (...a: unknown[]) => failGeneration(...a),
}));
const reserveCredits = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ ok: true }));
const settleGeneration = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => undefined);
const refundReservation = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => undefined);
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: (...a: unknown[]) => reserveCredits(...a),
  settleGeneration: (...a: unknown[]) => settleGeneration(...a),
  refundReservation: (...a: unknown[]) => refundReservation(...a),
  CreditLimitError: class extends Error {},
}));

import { POST } from "./route";
import { COMPOSITE_PROMPT_ID } from "@/prompts/composite-generate";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });

/** What the provider was called with. */
const sent = () => generate.mock.calls[0][0] as { prompt: string; referenceUrls: string[] };

beforeEach(() => {
  vi.clearAllMocks();
  stored.instruction = "";
  loadCompositeInputs.mockResolvedValue({ ok: true, refs: [AVATAR_REF, SHEET_REF, FILE_REF], avatarIds: ["av-1"], contexts: [] });
  generate.mockResolvedValue({ imageBase64: Buffer.from("png").toString("base64"), mimeType: "image/png", costUsd: 0.03 });
});

describe("POST composite-generate (D312)", () => {
  it("refuses with no instruction, before reserving", async () => {
    const res = await post({ instruction: "   " });
    expect(res.status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("uses the instruction from the request body over the stored one", async () => {
    stored.instruction = "stale words";
    await post({ instruction: "fresh words", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(sent().prompt).toContain("fresh words");
    expect(sent().prompt).not.toContain("stale words");
  });

  it("falls back to the stored instruction when the body has none", async () => {
    stored.instruction = "stored words";
    await post({ modelId: SEEDANCE_FACE_MODEL_ID });
    expect(sent().prompt).toContain("stored words");
  });

  it("refuses a dangling mention, naming it, before reserving", async () => {
    const res = await post({ instruction: "@[Avatar: Zoe](gone) in a kitchen", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("'Zoe'");
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses when an avatar cannot contribute a face", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: false, error: "Riya has no front image yet — finish them in the Avatar Studio." });
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("allows Nano Banana with an avatar wired — the operator chooses (D312)", async () => {
    const res = await post({ instruction: "x", modelId: "gemini:gemini-3-pro-image" });
    expect(res.status).toBe(200);
    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({ modelUsed: "gemini:gemini-3-pro-image" }));
  });

  it("defaults to Seedream when the request names no model", async () => {
    await post({ instruction: "x" });
    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({ modelUsed: SEEDANCE_FACE_MODEL_ID }));
  });

  it("allows any model when no avatar is wired", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [FILE_REF], avatarIds: [], contexts: [] });
    const res = await post({ instruction: "on a desk", modelId: "gemini:gemini-3-pro-image" });
    expect(res.status).toBe(200);
  });

  it("generates with zero references — a background from text alone", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [], avatarIds: [], contexts: [] });
    const res = await post({ instruction: "an empty bedroom, four angles" });
    expect(res.status).toBe(200);
    expect(sent().referenceUrls).toEqual([]);
  });

  it("refuses more images than the model takes, without slicing", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [FILE_REF, { ...FILE_REF, nodeId: "b", position: 2 }, { ...FILE_REF, nodeId: "c", position: 3 }], avatarIds: [], contexts: [] });
    const res = await post({ instruction: "x", modelId: "tiny:two" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("3 reference images");
    expect(generate).not.toHaveBeenCalled();
  });

  it("sends the avatar's front and sheet first, then the rest, and resolves chips to positions", async () => {
    await post({ instruction: "@[Avatar: Riya](n-av) holding @[File: Sandals.png](n-file)", modelId: SEEDANCE_FACE_MODEL_ID });
    const call = sent();
    expect(call.referenceUrls).toEqual(["https://cdn/front.png", "https://cdn/sheet.png", "https://cdn/sandals.png"]);
    expect(call.prompt).toContain("Riya (image 1) holding Sandals.png (image 3)");
  });

  // D320 — a shot chip carries no image, so it must not read as dangling; its text reaches the prompt.
  it("reads a mentioned shot from a wired script as context", async () => {
    loadCompositeInputs.mockResolvedValue({
      ok: true,
      refs: [FILE_REF],
      avatarIds: [],
      contexts: [
        {
          nodeId: "s",
          type: "script",
          title: "Launch reel",
          notes: "",
          shots: [
            { id: "s:shot:1", label: "Shot 1", text: "Opens the box." },
            { id: "s:shot:2", label: "Shot 2", text: "Sandals on the floor.", seconds: 2 },
          ],
        },
      ],
    });
    const res = await post({ instruction: "@[File: Sandals.png](n-file) for @[Shot: Launch reel · Shot 2](s:shot:2)" });
    expect(res.status).toBe(200);
    const { prompt } = sent();
    expect(prompt).toContain("for Shot 2 of Launch reel (see the shot context)");
    expect(prompt).toContain("Shot 2 (2s): Sandals on the floor.");
    expect(prompt).not.toContain("Opens the box.");
  });

  it("reserves, then settles, and records the avatar on the version", async () => {
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(200);
    expect(reserveCredits).toHaveBeenCalled();
    expect(settleGeneration).toHaveBeenCalled();
    const version = insertVersion.mock.calls[0][0] as { inputsUsed: Record<string, unknown> };
    expect(version.inputsUsed).toMatchObject({ avatarIds: ["av-1"], promptId: COMPOSITE_PROMPT_ID });
  });

  it("refunds when the provider fails, and records the failed attempt", async () => {
    generate.mockRejectedValue(new Error("provider down"));
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(500);
    expect(refundReservation).toHaveBeenCalled();
    expect(failGeneration).toHaveBeenCalled();
    expect(insertVersion).toHaveBeenCalledWith(expect.objectContaining({ error: "provider down" }));
  });

  describe("edit (D312)", () => {
    beforeEach(() => {
      getVersionById.mockResolvedValue({ id: "v-base", node_id: "node-1", output: "https://cdn/base.png" });
    });

    it("edits the current picture: base first, then the ticked references, with the edit template", async () => {
      const res = await post({ instruction: "the cup", modelId: SEEDANCE_FACE_MODEL_ID, edit: { baseVersionId: "v-base", intent: "remove", extraIds: ["n-file"] } });
      expect(res.status).toBe(200);
      expect(sent().referenceUrls).toEqual(["https://cdn/base.png", "https://cdn/sandals.png"]);
      expect(sent().prompt).toMatch(/^Using the provided image, remove the cup\./);
      const version = insertVersion.mock.calls[0][0] as { inputsUsed: Record<string, unknown> };
      expect(version.inputsUsed).toMatchObject({ mode: "edit", baseVersionId: "v-base", intent: "remove" });
    });

    it("a mentioned reference joins the edit even when not ticked", async () => {
      await post({ instruction: "@[File: Sandals.png](n-file) in his hand", edit: { baseVersionId: "v-base", intent: "add" } });
      expect(sent().referenceUrls).toEqual(["https://cdn/base.png", "https://cdn/sandals.png"]);
      expect(sent().prompt).toContain("Sandals.png (image 2) in his hand");
    });

    it("keeps the person when an avatar is wired", async () => {
      await post({ instruction: "the background warmer", edit: { baseVersionId: "v-base", intent: "modify" } });
      expect(sent().prompt).toMatch(/^Using the provided image, change only the background warmer/);
      expect(sent().prompt).toMatch(/same face/);
    });

    it("sends the operator's hand-edited prompt, with the rules still appended after it", async () => {
      await post({ instruction: "x", edit: { baseVersionId: "v-base", prompt: "MY EXACT PROMPT" } });
      expect(sent().prompt.startsWith("MY EXACT PROMPT")).toBe(true);
      expect(sent().prompt).toMatch(/Rules:/);
      expect(sent().prompt).toMatch(/same face/);
    });

    it("refuses a base that is not one of this node's versions, before reserving", async () => {
      getVersionById.mockResolvedValue({ id: "v-x", node_id: "other-node", output: "https://cdn/x.png" });
      const res = await post({ instruction: "x", edit: { baseVersionId: "v-x" } });
      expect(res.status).toBe(400);
      expect(insertGeneration).not.toHaveBeenCalled();
    });

    it("sends a painted region to a model that takes a mask, and says so in the prompt", async () => {
      const res = await post({
        instruction: "the mug",
        modelId: "openai:gpt-image-2",
        edit: { baseVersionId: "v-base", intent: "remove", maskBase64: "AAAA", maskMime: "image/png" },
      });
      expect(res.status).toBe(200);
      const call = generate.mock.calls[0][0] as { maskBase64?: string; maskMime?: string; prompt: string };
      expect(call.maskBase64).toBe("AAAA");
      expect(call.maskMime).toBe("image/png");
      expect(call.prompt).toMatch(/selected \(masked\) region/);
      const version = insertVersion.mock.calls[0][0] as { inputsUsed: Record<string, unknown> };
      expect(version.inputsUsed).toMatchObject({ masked: true });
    });

    it("refuses a painted region on a model that cannot take one, before reserving", async () => {
      const res = await post({
        instruction: "the mug",
        modelId: SEEDANCE_FACE_MODEL_ID,
        edit: { baseVersionId: "v-base", intent: "remove", maskBase64: "AAAA" },
      });
      expect(res.status).toBe(400);
      expect(insertGeneration).not.toHaveBeenCalled();
    });
  });
});
