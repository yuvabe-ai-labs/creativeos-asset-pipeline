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
  },
}));

vi.mock("@/lib/image-gen/estimate", () => ({ estimateImageGenerationCostUsd: () => 0.03 }));
vi.mock("@/lib/image-gen/cost", () => ({ computeImageCost: () => ({ usd: 0.03 }) }));
vi.mock("@/lib/storage", () => ({ uploadImageGen: vi.fn(async () => ({ url: "https://cdn/out.png" })) }));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 1152, height: 2048 }) }) }));

// Every mock takes `...a: unknown[]` so `mock.calls[0][0]` is typed and tsc stays clean.
const insertVersion = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ id: "v1" }));
vi.mock("@/lib/db/versions", () => ({
  insertVersion: (...a: unknown[]) => insertVersion(...a),
  setActiveVersion: vi.fn(async () => undefined),
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

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });

/** What the provider was called with. */
const sent = () => generate.mock.calls[0][0] as { prompt: string; referenceUrls: string[] };

beforeEach(() => {
  vi.clearAllMocks();
  stored.instruction = "";
  loadCompositeInputs.mockResolvedValue({ ok: true, refs: [AVATAR_REF, SHEET_REF, FILE_REF], avatarIds: ["av-1"] });
  generate.mockResolvedValue({ imageBase64: Buffer.from("png").toString("base64"), mimeType: "image/png", costUsd: 0.03 });
});

describe("POST composite-generate (D309)", () => {
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

  it("refuses a model other than the lock while an avatar is wired", async () => {
    const res = await post({ instruction: "x", modelId: "gemini:gemini-3-pro-image" });
    expect(res.status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("allows any model when no avatar is wired", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [FILE_REF], avatarIds: [] });
    const res = await post({ instruction: "on a desk", modelId: "gemini:gemini-3-pro-image" });
    expect(res.status).toBe(200);
  });

  it("generates with zero references — a background from text alone", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [], avatarIds: [] });
    const res = await post({ instruction: "an empty bedroom, four angles" });
    expect(res.status).toBe(200);
    expect(sent().referenceUrls).toEqual([]);
  });

  it("refuses more images than the model takes, without slicing", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [FILE_REF, { ...FILE_REF, nodeId: "b", position: 2 }, { ...FILE_REF, nodeId: "c", position: 3 }], avatarIds: [] });
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

  it("reserves, then settles, and records the avatar on the version", async () => {
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(200);
    expect(reserveCredits).toHaveBeenCalled();
    expect(settleGeneration).toHaveBeenCalled();
    const version = insertVersion.mock.calls[0][0] as { inputsUsed: Record<string, unknown> };
    expect(version.inputsUsed).toMatchObject({ avatarIds: ["av-1"], promptId: "composite-generate-v1" });
  });

  it("refunds when the provider fails, and records the failed attempt", async () => {
    generate.mockRejectedValue(new Error("provider down"));
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(500);
    expect(refundReservation).toHaveBeenCalled();
    expect(failGeneration).toHaveBeenCalled();
    expect(insertVersion).toHaveBeenCalledWith(expect.objectContaining({ error: "provider down" }));
  });
});
