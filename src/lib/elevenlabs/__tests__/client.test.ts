import { describe, it, expect, vi, afterEach } from "vitest";
import { speechToSpeech, ElevenLabsKeyMissingError, ElevenLabsHttpError } from "../client";

afterEach(() => {
  delete process.env.ELEVEN_LABS_API_KEY;
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

  it("throws an ElevenLabsHttpError carrying the status", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () => new Response("invalid voice", { status: 422 }));
    const err = await speechToSpeech(
      { audio: Buffer.from([1]), voiceId: "v" },
      fetchImpl as unknown as typeof fetch,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
    expect((err as ElevenLabsHttpError).status).toBe(422);
    expect((err as Error).message).toMatch(/422.*invalid voice/);
  });
});

describe("ElevenLabsHttpError", () => {
  it("names what failed", () => {
    expect(new ElevenLabsHttpError(403, "no", "voice save").message).toBe("ElevenLabs voice save failed: 403 no");
    expect(new ElevenLabsHttpError(429, "busy").message).toBe("ElevenLabs speech-to-speech failed: 429 busy");
  });
});
