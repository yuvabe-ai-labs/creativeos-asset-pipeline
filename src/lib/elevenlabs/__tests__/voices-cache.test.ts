import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listAccountVoices: vi.fn(),
  getAccountVoice: vi.fn(),
  listLibraryVoices: vi.fn(),
}));
vi.mock("../voice-catalog", () => mocks);

import {
  getAccountVoicesCached, getVoiceCached, getLibraryPageCached, invalidateAccountVoices, _resetVoiceCaches,
} from "../voices-cache";
import { VOICE_CACHE_MAX_ENTRIES } from "../constants";

const V = { voiceId: "a", source: "account", name: "A", description: null, previewUrl: null, labels: {}, category: "premade", priceMultiplier: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  _resetVoiceCaches();
});

describe("getAccountVoicesCached", () => {
  it("reuses the list for 5 minutes, reloads after, and never caches a failure", async () => {
    mocks.listAccountVoices.mockRejectedValueOnce(new Error("down")).mockResolvedValue([V]);
    await expect(getAccountVoicesCached(() => 0)).rejects.toThrow("down");
    await getAccountVoicesCached(() => 0);
    await getAccountVoicesCached(() => 4 * 60 * 1000);
    expect(mocks.listAccountVoices).toHaveBeenCalledTimes(2);
    await getAccountVoicesCached(() => 5 * 60 * 1000 + 1);
    expect(mocks.listAccountVoices).toHaveBeenCalledTimes(3);
  });

  it("invalidateAccountVoices forces a reload", async () => {
    mocks.listAccountVoices.mockResolvedValue([V]);
    await getAccountVoicesCached(() => 0);
    invalidateAccountVoices();
    await getAccountVoicesCached(() => 1);
    expect(mocks.listAccountVoices).toHaveBeenCalledTimes(2);
  });
});

describe("getVoiceCached", () => {
  it("caches per id, including a not-found result", async () => {
    mocks.getAccountVoice.mockResolvedValueOnce(V).mockResolvedValueOnce(null);
    expect(await getVoiceCached("a", () => 0)).toEqual(V);
    expect(await getVoiceCached("a", () => 1000)).toEqual(V);
    expect(await getVoiceCached("gone", () => 0)).toBeNull();
    expect(await getVoiceCached("gone", () => 1000)).toBeNull();
    expect(mocks.getAccountVoice).toHaveBeenCalledTimes(2);
  });
});

describe("getLibraryPageCached", () => {
  it("caches each distinct query for 60 s", async () => {
    mocks.listLibraryVoices.mockResolvedValue({ voices: [], hasMore: false });
    await getLibraryPageCached({ page: 0, gender: "female" }, () => 0);
    await getLibraryPageCached({ gender: "female", page: 0 }, () => 30_000);
    await getLibraryPageCached({ page: 1, gender: "female" }, () => 30_000);
    expect(mocks.listLibraryVoices).toHaveBeenCalledTimes(2);
    await getLibraryPageCached({ page: 0, gender: "female" }, () => 61_000);
    expect(mocks.listLibraryVoices).toHaveBeenCalledTimes(3);
  });
});

describe("review fix — cache cap", () => {
  it("getVoiceCached caps `singles` at VOICE_CACHE_MAX_ENTRIES, dropping the oldest first", async () => {
    mocks.getAccountVoice.mockImplementation(async (id: string) => ({ ...V, voiceId: id }));
    for (let i = 0; i <= VOICE_CACHE_MAX_ENTRIES; i++) {
      await getVoiceCached(`id${i}`, () => i);
    }
    mocks.getAccountVoice.mockClear();

    // The oldest entry (id0, written at t=0) was evicted to stay at the cap — a fresh lookup refetches it.
    await getVoiceCached("id0", () => VOICE_CACHE_MAX_ENTRIES + 1);
    expect(mocks.getAccountVoice).toHaveBeenCalledTimes(1);

    // The most recently written entry is still cached — no refetch.
    mocks.getAccountVoice.mockClear();
    await getVoiceCached(`id${VOICE_CACHE_MAX_ENTRIES}`, () => VOICE_CACHE_MAX_ENTRIES + 1);
    expect(mocks.getAccountVoice).not.toHaveBeenCalled();
  });

  it("getLibraryPageCached caps `libraryPages` the same way", async () => {
    mocks.listLibraryVoices.mockImplementation(async (q: { page: number }) => ({
      voices: [], hasMore: false, page: q.page,
    }));
    for (let i = 0; i <= VOICE_CACHE_MAX_ENTRIES; i++) {
      await getLibraryPageCached({ page: i }, () => i);
    }
    mocks.listLibraryVoices.mockClear();

    await getLibraryPageCached({ page: 0 }, () => VOICE_CACHE_MAX_ENTRIES + 1);
    expect(mocks.listLibraryVoices).toHaveBeenCalledTimes(1);

    mocks.listLibraryVoices.mockClear();
    await getLibraryPageCached({ page: VOICE_CACHE_MAX_ENTRIES }, () => VOICE_CACHE_MAX_ENTRIES + 1);
    expect(mocks.listLibraryVoices).not.toHaveBeenCalled();
  });
});
