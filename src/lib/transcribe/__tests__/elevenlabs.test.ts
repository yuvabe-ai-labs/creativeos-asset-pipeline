import { describe, expect, it, vi } from "vitest";
import { parseScribeResponse, transcribeUrl, TranscribeError } from "../elevenlabs";

// Trimmed from the real Reel 2 clip 5 response, plus the entry kinds we must skip.
const SAMPLE = {
  language_code: "eng", language_probability: 0.99, text: "It just became",
  words: [
    { text: "It", start: 0.12, end: 0.2, type: "word", logprob: -0.01 },
    { text: " ", start: 0.2, end: 0.24, type: "spacing", logprob: 0 },
    { text: "just", start: 0.24, end: 0.4, type: "word", logprob: -0.5 },
    { text: "(laughs)", start: 0.4, end: 0.6, type: "audio_event", logprob: 0 },
    { text: "became", start: 0.6, end: null, type: "word", logprob: 0 },
  ],
};
const ok = (body: unknown) => vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status: 200 }));

describe("parseScribeResponse", () => {
  it("keeps timed words only, with confidence from logprob", () => {
    const r = parseScribeResponse(SAMPLE);
    expect(r.language).toBe("eng");
    expect(r.words).toEqual([
      { t: "It", s: 0.12, e: 0.2, p: Math.round(Math.exp(-0.01) * 1000) / 1000 },
      { t: "just", s: 0.24, e: 0.4, p: Math.round(Math.exp(-0.5) * 1000) / 1000 },
    ]);
  });
});

describe("transcribeUrl", () => {
  it("sends the file by URL with word timing and no language", async () => {
    const fetch = ok(SAMPLE);
    await transcribeUrl("https://storage.googleapis.com/b/a.mp4", { fetch: fetch as unknown as typeof globalThis.fetch, apiKey: "k" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("source_url")).toBe("https://storage.googleapis.com/b/a.mp4");
    expect(form.get("timestamps_granularity")).toBe("word");
    expect(form.get("language_code")).toBeNull();
  });

  it("says no-speech for an empty transcript, and marks a vendor error as answered", async () => {
    const empty = ok({ language_code: "eng", words: [] }) as unknown as typeof globalThis.fetch;
    await expect(transcribeUrl("u", { fetch: empty, apiKey: "k" })).rejects.toMatchObject({ reason: "no-speech", answered: true });
    const bad = vi.fn(async () => new Response("nope", { status: 422 })) as unknown as typeof globalThis.fetch;
    await expect(transcribeUrl("u", { fetch: bad, apiKey: "k" })).rejects.toBeInstanceOf(TranscribeError);
    await expect(transcribeUrl("u", { fetch: bad, apiKey: "k" })).rejects.toMatchObject({ reason: "failed", answered: true });
  });

  it("marks a network error as not answered, so it may be tried again", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    await expect(transcribeUrl("u", { fetch: down, apiKey: "k" })).rejects.toMatchObject({ reason: "failed", answered: false });
  });
});
