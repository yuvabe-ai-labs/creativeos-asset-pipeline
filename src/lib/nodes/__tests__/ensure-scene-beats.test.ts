import { describe, it, expect, vi } from "vitest";
import { ensureSceneBeats } from "../ensure-scene-beats";
import { sceneFingerprint } from "../scene-beats";

const row = { description: "A → B", duration_seconds: 4 };
const BEATS = [
  { description: "A", duration_seconds: 2 },
  { description: "B", duration_seconds: 2 },
];

describe("ensureSceneBeats", () => {
  it("does not call the split when the row's beats are fresh", async () => {
    const split = vi.fn();
    const stamped = { ...row, beats: BEATS, beatsFor: sceneFingerprint(row) };
    expect(await ensureSceneBeats(stamped, undefined, split)).toEqual({ status: "fresh" });
    expect(split).not.toHaveBeenCalled();
  });

  it("does not call the split on a cache hit", async () => {
    const split = vi.fn();
    expect(await ensureSceneBeats(row, { [sceneFingerprint(row)]: BEATS }, split)).toEqual({
      status: "fresh",
    });
    expect(split).not.toHaveBeenCalled();
  });

  it("splits a stale or unsplit row and returns the fingerprint to cache under", async () => {
    const split = vi.fn(async () => ({ beats: BEATS, beatsFor: sceneFingerprint(row) }));
    expect(await ensureSceneBeats(row, undefined, split)).toEqual({
      status: "split",
      fingerprint: sceneFingerprint(row),
      beats: BEATS,
    });
    expect(split).toHaveBeenCalledWith(row);
  });

  it("reports a failed split instead of throwing", async () => {
    const split = vi.fn(async () => {
      throw new Error("500");
    });
    expect(await ensureSceneBeats(row, undefined, split)).toEqual({ status: "failed" });
  });
});
