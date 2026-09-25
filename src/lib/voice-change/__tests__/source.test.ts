import { describe, it, expect, vi } from "vitest";
import { resolveVoiceChangeSource, readVoiceChange } from "../source";

vi.mock("@/lib/storage", () => ({ isOwnStoredUrl: (u: string) => u.startsWith("https://storage.googleapis.com/b/") }));

const V = (id: string, over: Record<string, unknown> = {}) => ({
  id, node_id: "n1", org_id: "o", error: null, model_used: "gemini:omni",
  output: `https://storage.googleapis.com/b/${id}.mp4`,
  params_used: { durationSeconds: 8 }, inputs_used: {}, generated_output: null, decision: null, note: null,
  operator: null, operator_user_id: null, ...over,
});

describe("resolveVoiceChangeSource", () => {
  it("uses the chosen version when it is an original", async () => {
    const get = vi.fn(async (id: string) => (id === "v2" ? V("v2") : null));
    const r = await resolveVoiceChangeSource("n1", "v2", get as never);
    expect(r).toMatchObject({ ok: true, sourceUrl: "https://storage.googleapis.com/b/v2.mp4", durationSeconds: 8 });
    if (r.ok) expect(r.root.id).toBe("v2");
  });

  it("follows a voice-changed version back to its root's original audio", async () => {
    const v3 = V("v3", { inputs_used: { voiceChange: { rootVersionId: "v2" } } });
    const get = vi.fn(async (id: string) => (id === "v3" ? v3 : id === "v2" ? V("v2") : null));
    const r = await resolveVoiceChangeSource("n1", "v3", get as never);
    expect(r.ok && r.root.id).toBe("v2");
    expect(r.ok && r.base.id).toBe("v3");
  });

  it("rejects another node's version, a failed version, a non-stored output and an unknown duration", async () => {
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { node_id: "other" })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { error: "boom" })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { output: "https://provider/x.mp4" })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { params_used: {} })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "missing", vi.fn(async () => null) as never)).ok).toBe(false);
  });
});

describe("readVoiceChange", () => {
  it("reads a record and rejects garbage", () => {
    const rec = { baseVersionId: "v3", rootVersionId: "v2", sourceUrl: "u", voiceId: "a", voiceName: "Anjali", priceMultiplier: 2, settings: { stability: 50, similarity: 75, style: 0, speakerBoost: true, removeBackgroundNoise: false, modelId: "eleven_multilingual_sts_v2" } };
    expect(readVoiceChange(rec)).toEqual(rec);
    expect(readVoiceChange({ ...rec, priceMultiplier: 0.5 })?.priceMultiplier).toBe(1);
    expect(readVoiceChange({ voiceId: 3 })).toBeNull();
    expect(readVoiceChange(undefined)).toBeNull();
  });
});
