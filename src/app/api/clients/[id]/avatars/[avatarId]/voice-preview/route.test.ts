import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GENERATED, makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";
import { AVATAR_VOICE_PREVIEW_SLOT } from "@/lib/avatars/constants";
import { estimateVoicePreviewCredits, VOICE_PREVIEW_ENGINE } from "@/lib/avatars/voice-preview";
import type { AvatarVoice } from "@/lib/avatars/schema";

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({
  insertGeneration: vi.fn(), failGeneration: vi.fn(), getLatestAvatarVoicePreview: vi.fn(),
}));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError, reserveCredits: vi.fn(), refundReservation: vi.fn() };
});
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: vi.fn() }));
vi.mock("@/lib/storage", () => ({ signAvatarVoicePreviewUrl: vi.fn(), signAvatarVoiceSampleUrl: vi.fn() }));

import { tasks } from "@trigger.dev/sdk/v3";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { insertGeneration, failGeneration, getLatestAvatarVoicePreview } from "@/lib/db/generations";
import { reserveCredits, refundReservation } from "@/lib/db/credit-transactions";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { signAvatarVoicePreviewUrl, signAvatarVoiceSampleUrl } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const url = "http://localhost/api/clients/c1/avatars/a1/voice-preview";
const post = (body: unknown) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const NAMED: AvatarVoice = { mode: "named", voiceId: "v1", name: "Surabhi", labels: {}, previewUrl: null };
const FRONT = makeImage().url;
const inputs = {
  slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "named", line: "Hello there.", voiceId: "v1",
  voiceName: "Surabhi", priceMultiplier: 2, frontUrl: FRONT,
};
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "g1", avatar_id: "a1", node_id: null, org_id: "org-1", status: "running", error: null,
  inputs_snapshot: inputs, output_snapshot: null, created_at: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  process.env.ELEVEN_LABS_API_KEY = "key";
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ voice: NAMED }));
  vi.mocked(getLatestAvatarVoicePreview).mockResolvedValue(null);
  vi.mocked(getVoiceCached).mockResolvedValue({ voiceId: "v1", name: "Surabhi", priceMultiplier: 2 } as never);
  vi.mocked(insertGeneration).mockResolvedValue(row() as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true } as never);
  vi.mocked(failGeneration).mockResolvedValue(undefined as never);
  vi.mocked(refundReservation).mockResolvedValue(undefined as never);
  vi.mocked(signAvatarVoicePreviewUrl).mockResolvedValue({ putUrl: "https://signed/put", url: "https://storage.googleapis.com/b/p.mp4" });
  vi.mocked(signAvatarVoiceSampleUrl).mockResolvedValue({ putUrl: "https://signed/sample", url: "https://storage.googleapis.com/b/s.mp3" });
});

describe("GET voice-preview", () => {
  it("returns the latest preview and what the next one costs at this voice's rate", async () => {
    vi.mocked(getLatestAvatarVoicePreview).mockResolvedValue(
      row({ status: "succeeded", output_snapshot: "https://storage.googleapis.com/b/p.mp4" }) as never,
    );
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(url), { params });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.preview).toMatchObject({ generationId: "g1", status: "succeeded", url: "https://storage.googleapis.com/b/p.mp4", line: "Hello there." });
    expect(json.estimateCredits).toBe(estimateVoicePreviewCredits("named", 2));
  });

  it("has no preview and no estimate for an avatar with no voice declared", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ voice: null }));
    const { GET } = await import("./route");
    const json = await (await GET(new NextRequest(url), { params })).json();
    expect(json).toEqual({ preview: null, estimateCredits: null });
  });

  it("fails and refunds a preview left running long after its task must have ended", async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    vi.mocked(getLatestAvatarVoicePreview).mockResolvedValue(row({ created_at: old }) as never);
    const { GET } = await import("./route");
    const json = await (await GET(new NextRequest(url), { params })).json();
    expect(failGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1" }));
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(json.preview.status).toBe("failed");
  });

  it("is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params })).status).toBe(404);
  });
});

describe("POST voice-preview", () => {
  it("reserves the credits, signs the upload and queues the task with the front image and the voice", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ line: "  Hello there.  " }), { params });
    expect(res.status).toBe(202);
    expect((await res.json()).preview).toMatchObject({ generationId: "g1", status: "running" });
    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      avatarId: "a1", orgId: "org-1", clientId: "c1", userId: "user-9", type: "video",
      modelUsed: VOICE_PREVIEW_ENGINE.named.modelId,
      inputsSnapshot: expect.objectContaining({ ...inputs, prompt: expect.stringContaining('"Hello there."') }),
    }));
    expect(reserveCredits).toHaveBeenCalledWith("org-1", "g1", estimateVoicePreviewCredits("named", 2));
    expect(tasks.trigger).toHaveBeenCalledWith("avatar-voice-preview", expect.objectContaining({
      mode: "named", generationId: "g1", frontUrl: FRONT, voiceId: "v1",
      revoicedPutUrl: "https://signed/put", revoicedUrl: "https://storage.googleapis.com/b/p.mp4",
      params: expect.objectContaining({ duration: 6, resolution: "720p" }),
    }));
  });

  it("refuses an empty line", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ line: "   " }), { params })).status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses a preview when no voice is declared — the declaration picks the engine", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ voice: null }));
    const { POST } = await import("./route");
    const res = await POST(post({ line: "Hi." }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/choose a voice/i);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses an archived avatar", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ voice: NAMED, archivedAt: "2026-09-30T11:00:00.000Z" }));
    const { POST } = await import("./route");
    expect((await POST(post({ line: "Hi." }), { params })).status).toBe(404);
  });

  it("refuses a second preview while one is running — no double charge", async () => {
    vi.mocked(getLatestAvatarVoicePreview).mockResolvedValue(row() as never);
    const { POST } = await import("./route");
    expect((await POST(post({ line: "Hi." }), { params })).status).toBe(409);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses a voice that has left the ElevenLabs account", async () => {
    vi.mocked(getVoiceCached).mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post({ line: "Hi." }), { params })).status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("is a 402 at the credit limit, with the generation failed and nothing queued", async () => {
    vi.mocked(reserveCredits).mockResolvedValue({ ok: false } as never);
    const { POST } = await import("./route");
    expect((await POST(post({ line: "Hi." }), { params })).status).toBe(402);
    expect(failGeneration).toHaveBeenCalled();
    expect(tasks.trigger).not.toHaveBeenCalled();
  });

  it("fails the generation and refunds when the task cannot be queued", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("Trigger.dev unreachable"));
    const { POST } = await import("./route");
    expect((await POST(post({ line: "Hi." }), { params })).status).toBe(500);
    expect(failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "Trigger.dev unreachable" });
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });
});

describe("POST voice-preview — the engine's own voice (D296)", () => {
  const nativeAvatar = makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: { mode: "native" } });
  beforeEach(() => {
    vi.mocked(getAvatar).mockResolvedValue(nativeAvatar);
    vi.mocked(insertGeneration).mockResolvedValue(
      row({ inputs_snapshot: { slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "native", line: "Hi.", frontUrl: nativeAvatar.front!.url } }) as never,
    );
  });

  it("runs Seedance at 480p, signs both uploads, and never asks ElevenLabs anything", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ line: "Hi." }), { params });
    expect(res.status).toBe(202);
    expect(getVoiceCached).not.toHaveBeenCalled();
    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      modelUsed: VOICE_PREVIEW_ENGINE.native.modelId,
      paramsSnapshot: expect.objectContaining({ resolution: "480p", duration: 5, ratio: "9:16" }),
      inputsSnapshot: expect.objectContaining({ mode: "native", line: "Hi." }),
    }));
    expect(reserveCredits).toHaveBeenCalledWith("org-1", "g1", estimateVoicePreviewCredits("native"));
    expect(tasks.trigger).toHaveBeenCalledWith("avatar-voice-preview", expect.objectContaining({
      mode: "native",
      clipPutUrl: "https://signed/put",
      samplePutUrl: "https://signed/sample",
      sampleUrl: "https://storage.googleapis.com/b/s.mp3",
    }));
  });

  it("records no voice id — Seedance's voice exists only in the clip", async () => {
    const { POST } = await import("./route");
    await POST(post({ line: "Hi." }), { params });
    const inputs = vi.mocked(insertGeneration).mock.calls[0][0].inputsSnapshot!;
    expect(inputs.voiceId).toBeUndefined();
    expect(inputs.priceMultiplier).toBeUndefined();
  });

  it("runs without an ElevenLabs key at all", async () => {
    delete process.env.ELEVEN_LABS_API_KEY;
    const { POST } = await import("./route");
    expect((await POST(post({ line: "Hi." }), { params })).status).toBe(202);
  });

  it("reports the next one's cost as the Seedance clip alone", async () => {
    vi.mocked(getLatestAvatarVoicePreview).mockResolvedValue(null);
    const { GET } = await import("./route");
    const json = await (await GET(new NextRequest(url), { params })).json();
    expect(json.estimateCredits).toBe(estimateVoicePreviewCredits("native"));
  });
});
