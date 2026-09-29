import { describe, it, expect } from "vitest";
import type { ReelShot, SceneBeat } from "../reel-script";
import { normalizeBeats, stampSceneBeats } from "../normalize-beats";
import { sceneFingerprint } from "../scene-beats";

const vo = (text: string) => ({ text, speaker: "narrator", delivery: "", language: "" });
const row = (over: Partial<ReelShot> = {}): ReelShot => ({
  description: "A → B → C",
  duration_seconds: 9,
  voiceover: [vo("One."), vo("Two.")],
  ...over,
});
const beat = (description: string, duration_seconds: number, lines: string[] = []): SceneBeat => ({
  description,
  duration_seconds,
  voiceover: lines.map(vo),
});
const secs = (beats: SceneBeat[]) => beats.map((b) => b.duration_seconds);
const texts = (beats: SceneBeat[]) => beats.map((b) => b.voiceover?.map((l) => l.text));

describe("normalizeBeats — lengths", () => {
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
});

describe("normalizeBeats — voiceover", () => {
  it("mirrors the row, lines and all, as one beat when the model returned none", () => {
    expect(normalizeBeats(row(), [])).toEqual([
      { description: "A → B → C", duration_seconds: 9, voiceover: [vo("One."), vo("Two.")] },
    ]);
  });

  it("keeps tied lines that follow the scene's order", () => {
    const out = normalizeBeats(row(), [beat("A", 3, ["One."]), beat("B", 3), beat("C", 3, ["Two."])]);
    expect(texts(out)).toEqual([["One."], [], ["Two."]]);
  });

  // A line on no beat is not lost — it spans the sequence (multishotSeedFor derives it).
  it("keeps a partial tie; the untied line is left to span", () => {
    const out = normalizeBeats(row(), [beat("A", 3), beat("B", 3, ["Two."]), beat("C", 3)]);
    expect(texts(out)).toEqual([[], ["Two."], []]);
  });

  it.each([
    ["out of order", [beat("A", 3, ["Two."]), beat("B", 3, ["One."]), beat("C", 3)]],
    ["repeated", [beat("A", 3, ["One."]), beat("B", 3, ["One."]), beat("C", 3)]],
    ["invented", [beat("A", 3, ["Three."]), beat("B", 3), beat("C", 3)]],
  ])("drops every tie when the lines are %s, so all of them span", (_label, raw) => {
    expect(texts(normalizeBeats(row(), raw))).toEqual([[], [], []]);
  });

  it("leaves voiceover absent on every beat when the scene has no key", () => {
    const out = normalizeBeats(row({ voiceover: undefined }), [beat("A", 4, ["Invented."]), beat("B", 5)]);
    expect(out.every((b) => !("voiceover" in b))).toBe(true);
  });
});

describe("stampSceneBeats", () => {
  it("normalises every row and stamps the fingerprint of the row as parsed", () => {
    const script = { visual_script: { shots: [{ ...row(), beats: [beat("A", 9, ["One.", "Two."])] }] } };
    const shot = stampSceneBeats(script).visual_script!.shots![0];
    expect(shot.beats).toHaveLength(1);
    expect(shot.beatsFor).toBe(sceneFingerprint(row()));
  });

  it("returns a script with no shots unchanged", () => {
    expect(stampSceneBeats({ title: "x" })).toEqual({ title: "x" });
  });
});
