import { describe, it, expect, vi, afterEach } from "vitest";
import { mapVoices, listVoices, speechToSpeech, ElevenLabsKeyMissingError } from "../client";

afterEach(() => {
  delete process.env.ELEVEN_LABS_API_KEY;
});

describe("mapVoices", () => {
  it("maps fields and puts custom voices first, then sorts by name", () => {
    const voices = mapVoices({
      voices: [
        { voice_id: "p2", name: "Zara", category: "premade", preview_url: "https://p/z.mp3" },
        { voice_id: "c1", name: "Priya", category: "cloned", preview_url: null },
        { voice_id: "p1", name: "Adam", category: "premade", preview_url: "https://p/a.mp3" },
        { voice_id: "g1", name: "Brand", category: "generated" },
      ],
    });
    expect(voices.map((v) => v.voiceId)).toEqual(["g1", "c1", "p1", "p2"]);
    expect(voices[1]).toEqual({ voiceId: "c1", name: "Priya", category: "cloned", previewUrl: null });
    expect(voices[2].previewUrl).toBe("https://p/a.mp3");
  });

  it("drops malformed rows and tolerates a missing list", () => {
    expect(mapVoices({ voices: [{ name: "no id" }, null] })).toEqual([]);
    expect(mapVoices(null)).toEqual([]);
  });
});

describe("listVoices", () => {
  it("throws ElevenLabsKeyMissingError when the key is unset", async () => {
    await expect(listVoices(vi.fn())).rejects.toBeInstanceOf(ElevenLabsKeyMissingError);
  });

  it("calls /v1/voices with the key header", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ voices: [{ voice_id: "a", name: "A", category: "premade" }] })),
    );
    const voices = await listVoices(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": "k" },
    });
    expect(voices).toHaveLength(1);
  });

  it("throws with the status on a non-OK response", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(listVoices(fetchImpl as unknown as typeof fetch)).rejects.toThrow("401");
  });
});

describe("speechToSpeech", () => {
  it("posts multipart audio + model_id and returns the audio bytes", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("model_id")).toBe("eleven_multilingual_sts_v2");
      expect(form.get("audio")).toBeInstanceOf(Blob);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const out = await speechToSpeech(
      { audio: Buffer.from([9, 9]), voiceId: "voice-1" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/speech-to-speech/voice-1");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toEqual({ "xi-api-key": "k" });
    expect([...out]).toEqual([1, 2, 3]);
  });

  it("throws with ElevenLabs' message on failure", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () => new Response("quota_exceeded", { status: 429 }));
    await expect(
      speechToSpeech({ audio: Buffer.from([1]), voiceId: "v" }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/429.*quota_exceeded/);
  });
});
