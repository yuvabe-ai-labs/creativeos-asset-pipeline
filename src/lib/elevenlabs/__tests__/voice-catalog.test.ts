import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  priceMultiplierOf, mapAccountVoice, mapLibraryVoice, listAccountVoices, getAccountVoice,
  listLibraryVoices, saveLibraryVoice,
} from "../voice-catalog";
import { ElevenLabsKeyMissingError, ElevenLabsHttpError } from "../client";

beforeEach(() => { process.env.ELEVEN_LABS_API_KEY = "k"; });
afterEach(() => { delete process.env.ELEVEN_LABS_API_KEY; });

// Shapes copied from live responses, 2026-09-25.
const ACCOUNT_RAW = {
  voice_id: "a1", name: "Sarah", category: "premade", description: "Young adult woman",
  preview_url: "https://p/sarah.mp3",
  labels: { gender: "female", age: "young", accent: "american", language: "en", use_case: "informative_educational", descriptive: "professional" },
};
const SAVED_RAW = {
  voice_id: "s1", name: "David", category: "professional", description: null, preview_url: null,
  labels: { gender: "male" },
  sharing: { public_owner_id: "own1", original_voice_id: "lib1", rate: 2, fiat_rate: 0.2 },
};
const LIBRARY_RAW = {
  public_owner_id: "own2", voice_id: "lib2", name: "Anjali", accent: "indian", gender: "female",
  age: "young", descriptive: "warm", use_case: "social_media", category: "high_quality",
  language: "hi", description: "Warm, cheerful", preview_url: "https://p/anjali.mp3", rate: 1,
  is_added_by_user: false,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("priceMultiplierOf", () => {
  it("uses numeric rates ≥ 1 and defaults everything else to 1", () => {
    expect(priceMultiplierOf(2)).toBe(2);
    expect(priceMultiplierOf(1.5)).toBe(1.5);
    expect(priceMultiplierOf(undefined)).toBe(1);
    expect(priceMultiplierOf(null)).toBe(1);
    expect(priceMultiplierOf(0.5)).toBe(1);
    expect(priceMultiplierOf("2")).toBe(1);
  });
});

describe("mapAccountVoice / mapLibraryVoice", () => {
  it("maps an account voice, labels renamed to camelCase", () => {
    expect(mapAccountVoice(ACCOUNT_RAW)).toEqual({
      voiceId: "a1", source: "account", name: "Sarah", description: "Young adult woman",
      previewUrl: "https://p/sarah.mp3", category: "premade", priceMultiplier: 1,
      labels: { gender: "female", age: "young", accent: "american", language: "en", useCase: "informative_educational", descriptive: "professional" },
    });
  });

  it("takes a saved Library voice's multiplier from sharing.rate", () => {
    const v = mapAccountVoice(SAVED_RAW)!;
    expect(v.priceMultiplier).toBe(2);
    expect(v.originalVoiceId).toBe("lib1");
    expect(v.publicOwnerId).toBe("own1");
  });

  it("maps a Library voice from its flat fields", () => {
    expect(mapLibraryVoice(LIBRARY_RAW)).toEqual({
      voiceId: "lib2", source: "library", name: "Anjali", description: "Warm, cheerful",
      previewUrl: "https://p/anjali.mp3", category: "high_quality", priceMultiplier: 1,
      publicOwnerId: "own2", isAddedByUser: false,
      labels: { gender: "female", age: "young", accent: "indian", language: "hi", useCase: "social_media", descriptive: "warm" },
    });
  });

  it("returns null for malformed rows", () => {
    expect(mapAccountVoice({ name: "x" })).toBeNull();
    expect(mapLibraryVoice({ voice_id: "v", name: "n" })).toBeNull(); // no public_owner_id
    expect(mapLibraryVoice(null)).toBeNull();
  });
});

describe("listAccountVoices", () => {
  it("follows next_page_token across pages on /v2/voices", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ voices: [ACCOUNT_RAW], has_more: true, next_page_token: "t2" }))
      .mockResolvedValueOnce(json({ voices: [SAVED_RAW], has_more: false, next_page_token: null }));
    const voices = await listAccountVoices(fetchImpl as unknown as typeof fetch);
    expect(voices.map((v) => v.voiceId)).toEqual(["a1", "s1"]);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false",
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false&next_page_token=t2",
    );
    expect(fetchImpl.mock.calls[0][1]).toEqual({ headers: { "xi-api-key": "k" } });
  });

  it("throws ElevenLabsKeyMissingError without a key", async () => {
    delete process.env.ELEVEN_LABS_API_KEY;
    await expect(listAccountVoices(vi.fn())).rejects.toBeInstanceOf(ElevenLabsKeyMissingError);
  });

  it("throws ElevenLabsHttpError with the status", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const err = await listAccountVoices(fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
    expect(err.status).toBe(401);
    expect(err.message).toContain("voices");
  });
});

describe("getAccountVoice", () => {
  it("looks one voice up with voice_ids", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ voices: [SAVED_RAW], has_more: false }));
    const v = await getAccountVoice("s1", fetchImpl as unknown as typeof fetch);
    expect(v?.voiceId).toBe("s1");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v2/voices?voice_ids=s1");
  });

  it("returns null when the account doesn't have it", async () => {
    const fetchImpl = vi.fn(async () => json({ voices: [], has_more: false }));
    expect(await getAccountVoice("gone", fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});

describe("listLibraryVoices", () => {
  it("builds the shared-voices query and reports has_more", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ voices: [LIBRARY_RAW], has_more: true }));
    const out = await listLibraryVoices(
      { search: "warm", gender: "female", language: "hi", useCase: "social_media", sort: "trending", page: 2 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toEqual({ voices: [mapLibraryVoice(LIBRARY_RAW)], hasMore: true });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://api.elevenlabs.io/v1/shared-voices");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page_size: "30", page: "2", include_custom_rates: "true", search: "warm", gender: "female",
      language: "hi", use_cases: "social_media", sort: "trending",
    });
  });
});

describe("saveLibraryVoice", () => {
  it("posts to /v1/voices/add and returns the new account id", async () => {
    const fetchImpl = vi.fn(async () => json({ voice_id: "acct9" }));
    const id = await saveLibraryVoice(
      { publicOwnerId: "own2", voiceId: "lib2", name: "Anjali" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(id).toBe("acct9");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/voices/add/own2/lib2", {
      method: "POST",
      headers: { "xi-api-key": "k", "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: "Anjali" }),
    });
  });

  it("surfaces ElevenLabs' refusal with its status and message", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"detail":{"message":"Voice not allowed"}}', { status: 403 }));
    const err = await saveLibraryVoice({ publicOwnerId: "o", voiceId: "v", name: "n" }, fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
    expect(err.status).toBe(403);
    expect(err.message).toContain("Voice not allowed");
  });
});
