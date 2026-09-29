import { describe, it, expect } from "vitest";
import type { ReelShot, SceneBeat } from "../reel-script";
import { sceneFingerprint, beatsForScene, multishotSeedFor, pruneBeatCache } from "../scene-beats";

const vo = (text: string) => ({ text, speaker: "narrator" });
const row = (over: Partial<ReelShot> = {}): ReelShot => ({
  description: "Jar on marble → spoon lifts cream → hand smooths it on",
  duration_seconds: 6,
  voiceover: [vo("Meet the jar."), vo("Made slowly, by hand.")],
  ...over,
});
const THREE: SceneBeat[] = [
  { description: "Jar on marble", duration_seconds: 2 },
  { description: "Spoon lifts cream", duration_seconds: 2 },
  { description: "Hand smooths it on", duration_seconds: 2 },
];
const stamped = (over: Partial<ReelShot> = {}): ReelShot => {
  const r = row(over);
  return { ...r, beats: THREE, beatsFor: sceneFingerprint(r) };
};

describe("sceneFingerprint", () => {
  it("is stable for an unchanged row and ignores the beats themselves", () => {
    expect(sceneFingerprint(row())).toBe(sceneFingerprint({ ...row(), beats: THREE }));
  });

  it("changes when the description or length changes", () => {
    const base = sceneFingerprint(row());
    expect(sceneFingerprint(row({ description: "Something else" }))).not.toBe(base);
    expect(sceneFingerprint(row({ duration_seconds: 7 }))).not.toBe(base);
  });

  // Beats carry no voiceover, so editing a line must not throw away a good split.
  it("does not change when only the voiceover changes", () => {
    expect(sceneFingerprint(row({ voiceover: [vo("Changed.")] }))).toBe(sceneFingerprint(row()));
  });

  it("ignores surrounding whitespace in the description", () => {
    expect(sceneFingerprint(row({ description: "  x  " }))).toBe(
      sceneFingerprint(row({ description: "x" })),
    );
  });
});

describe("beatsForScene", () => {
  it("returns the row's own beats as fresh when the fingerprint matches", () => {
    expect(beatsForScene(stamped())).toEqual({ beats: THREE, fresh: true });
  });

  it("returns stale row beats as not fresh after an edit", () => {
    const edited = { ...stamped(), description: "Edited" };
    expect(beatsForScene(edited)).toEqual({ beats: THREE, fresh: false });
  });

  it("prefers a cache hit for the current fingerprint over stale row beats", () => {
    const edited = { ...stamped(), description: "Edited" };
    const two = THREE.slice(0, 2);
    expect(beatsForScene(edited, { [sceneFingerprint(edited)]: two })).toEqual({
      beats: two,
      fresh: true,
    });
  });

  it("reports a pre-v10 row as having no beats", () => {
    expect(beatsForScene(row())).toEqual({ beats: undefined, fresh: false });
  });
});

describe("multishotSeedFor", () => {
  it("turns 2+ fresh beats into one silent cut row each", () => {
    expect(multishotSeedFor(stamped()).rows).toEqual([
      { description: "Jar on marble", duration_seconds: 2, voiceover: [] },
      { description: "Spoon lifts cream", duration_seconds: 2, voiceover: [] },
      { description: "Hand smooths it on", duration_seconds: 2, voiceover: [] },
    ]);
  });

  // Operator, 2026-09-29: "by default have the VO at sequence level".
  it("puts every line of the scene on the sequence, in script order", () => {
    expect(multishotSeedFor(stamped()).sequenceVoiceover).toEqual([
      vo("Meet the jar."),
      vo("Made slowly, by hand."),
    ]);
  });

  it("omits the sequence lines when the scene has none", () => {
    expect(multishotSeedFor(stamped({ voiceover: [] }))).not.toHaveProperty("sequenceVoiceover");
  });

  it("keeps the row whole, lines and all, when there is a single beat", () => {
    const r = { ...row(), beats: [THREE[0]], beatsFor: sceneFingerprint(row()) };
    expect(multishotSeedFor(r)).toEqual({ rows: [r] });
  });

  it("never turns stale beats into cuts", () => {
    const edited = { ...stamped(), description: "Edited" };
    expect(multishotSeedFor(edited)).toEqual({ rows: [edited] });
  });

  it("uses fresh cached beats", () => {
    const r = row();
    expect(multishotSeedFor(r, { [sceneFingerprint(r)]: THREE }).rows).toHaveLength(3);
  });

  it("omits voiceover on cuts and the sequence when the scene has no key", () => {
    const r = row({ voiceover: undefined });
    const seed = multishotSeedFor(r, { [sceneFingerprint(r)]: THREE });
    expect(seed.rows.every((x) => !("voiceover" in x))).toBe(true);
    expect(seed).not.toHaveProperty("sequenceVoiceover");
  });
});

describe("pruneBeatCache", () => {
  it("adds the new entry and drops keys no current row has", () => {
    const a = row({ description: "a" });
    const b = row({ description: "b" });
    const old = { stale: THREE, [sceneFingerprint(a)]: THREE };
    const next = pruneBeatCache(old, [a, b], sceneFingerprint(b), THREE);
    expect(Object.keys(next).sort()).toEqual([sceneFingerprint(a), sceneFingerprint(b)].sort());
  });

  it("works from an empty cache", () => {
    const a = row();
    expect(pruneBeatCache(undefined, [a], sceneFingerprint(a), THREE)).toEqual({
      [sceneFingerprint(a)]: THREE,
    });
  });
});
