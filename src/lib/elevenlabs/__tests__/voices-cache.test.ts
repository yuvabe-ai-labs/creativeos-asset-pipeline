import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVoicesCached, _resetVoicesCache } from "../voices-cache";

const V = [{ voiceId: "a", name: "A", category: "premade", previewUrl: null }];

beforeEach(() => _resetVoicesCache());

describe("getVoicesCached", () => {
  it("reuses the list for 5 minutes, then reloads", async () => {
    const loader = vi.fn(async () => V);
    let t = 0;
    const now = () => t;
    await getVoicesCached(loader, now);
    t = 4 * 60 * 1000;
    await getVoicesCached(loader, now);
    expect(loader).toHaveBeenCalledTimes(1);
    t = 5 * 60 * 1000 + 1;
    await getVoicesCached(loader, now);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(V);
    await expect(getVoicesCached(loader, () => 0)).rejects.toThrow("down");
    await expect(getVoicesCached(loader, () => 0)).resolves.toEqual(V);
  });
});
