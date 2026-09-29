import { describe, it, expect } from "vitest";
import type { ReelShot, SceneBeat } from "../reel-script";
import { normalizeBeats, stampSceneBeats } from "../normalize-beats";
import { sceneFingerprint } from "../scene-beats";

const row = (over: Partial<ReelShot> = {}): ReelShot => ({
  description: "A → B → C",
  duration_seconds: 9,
  voiceover: [{ text: "One.", speaker: "narrator" }],
  ...over,
});
const beat = (description: string, duration_seconds: number): SceneBeat => ({
  description,
  duration_seconds,
});
const secs = (beats: SceneBeat[]) => beats.map((b) => b.duration_seconds);

describe("normalizeBeats", () => {
  it("keeps beats that already add up", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 3), beat("B", 3), beat("C", 3)]))).toEqual([3, 3, 3]);
  });

  it("adds a shortfall to the longest beat", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 2), beat("B", 4), beat("C", 1)]))).toEqual([2, 6, 1]);
  });

  it("takes an excess from the longest beat, never below one second", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 8), beat("B", 3), beat("C", 1)]))).toEqual([5, 3, 1]);
  });

  it("rounds and floors model numbers before correcting", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 0), beat("B", 2.6), beat("C", 5.2)]))).toEqual([1, 3, 5]);
  });

  // D237 — a scene shorter than its beats' floors keeps the floors; the ladder states it later.
  it("keeps floored beats when the scene is too short for them", () => {
    expect(
      secs(normalizeBeats(row({ duration_seconds: 2 }), [beat("A", 1), beat("B", 1), beat("C", 1)])),
    ).toEqual([1, 1, 1]);
  });

  it("uses the assumed length when the row has none", () => {
    expect(secs(normalizeBeats(row({ duration_seconds: undefined }), undefined))).toEqual([4]);
  });

  it("mirrors the row as one beat when the model returned none", () => {
    expect(normalizeBeats(row(), [])).toEqual([{ description: "A → B → C", duration_seconds: 9 }]);
  });

  // Beats are visual only; a stray voiceover (an older prompt's shape) must not ride a cut.
  it("keeps only description and length", () => {
    const stray = { ...beat("A", 9), voiceover: [{ text: "One.", speaker: "narrator" }] } as SceneBeat;
    expect(normalizeBeats(row(), [stray])).toEqual([{ description: "A", duration_seconds: 9 }]);
  });
});

describe("stampSceneBeats", () => {
  it("normalises every row and stamps the fingerprint of the row as parsed", () => {
    const script = { visual_script: { shots: [{ ...row(), beats: [beat("A", 9)] }] } };
    const shot = stampSceneBeats(script).visual_script!.shots![0];
    expect(shot.beats).toEqual([{ description: "A", duration_seconds: 9 }]);
    expect(shot.beatsFor).toBe(sceneFingerprint(row()));
  });

  it("returns a script with no shots unchanged", () => {
    expect(stampSceneBeats({ title: "x" })).toEqual({ title: "x" });
  });
});
