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
