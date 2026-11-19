import { describe, expect, it } from "vitest";
import { kbWith, withImageAnalysis } from "@/lib/kb/__tests__/fixtures";
import { buildChangeCard, decideChange, outOfDatePaths, refusedKeys, sameValue } from "../card";
import type { ChangeCard } from "@/lib/journey/thread/schema";

const V1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
const DOC = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c22";
const TONE = "brand_profile.tone_of_voice";
const WORDS = "compliance.never_use_words";
const kb = kbWith({ [TONE]: { value: "Warm", status: "approved" }, [WORDS]: { value: ["cheap"], status: "approved" } });
const card = (over: Partial<ChangeCard> = {}): ChangeCard => ({
  kind: "change", versionId: V1, status: "pending", decision: null,
  fields: [
    { path: TONE, label: "Tone of Voice", before: "Warm", after: "Warm and plain", from: "You, in this chat", docId: null },
    { path: WORDS, label: "Never Use Words", before: ["cheap"], after: ["cheap", "chemical-free"], from: "guide.pdf", docId: DOC },
  ],
  ...over,
});

describe("sameValue", () => {
  it("ignores list order and surrounding spaces", () => {
    expect(sameValue(["a", " b"], ["b", "a"])).toBe(true);
    expect(sameValue(" Warm ", "Warm")).toBe(true);
    expect(sameValue("Warm", "warm and plain")).toBe(false);
    expect(sameValue(null, [])).toBe(true);
  });
});

describe("buildChangeCard", () => {
  it("lists each proposed field with its label, before, after and source", () => {
    const built = buildChangeCard({ versionId: V1, current: kb, refused: new Set(), proposals: [{ path: TONE, value: "Warm and plain", from: "You, in this chat", docId: null }] });
    expect(built).toEqual({
      kind: "change", versionId: V1, status: "pending", decision: null,
      fields: [{ path: TONE, label: expect.any(String), before: "Warm", after: "Warm and plain", from: "You, in this chat", docId: null }],
    });
    expect(built!.fields[0].label).toMatch(/tone/i);
  });

  it("leaves out a value equal to what is there, ignoring list order and spaces", () => {
    expect(buildChangeCard({ versionId: V1, current: kb, refused: new Set(), proposals: [{ path: TONE, value: " Warm ", from: "x", docId: null }] })).toBeNull();
  });

  it("leaves out a path that is not one of the review fields, including image_analysis", () => {
    const built = buildChangeCard({
      versionId: V1, current: kb, refused: new Set(),
      proposals: [{ path: "image_analysis.mood", value: "x", from: "x", docId: null }, { path: "brand_profile.nope", value: "x", from: "x", docId: null }],
    });
    expect(built).toBeNull();
  });

  it("leaves out a change from a document that was refused before", () => {
    const built = buildChangeCard({ versionId: V1, current: kb, refused: new Set([`${DOC}|${TONE}`]), proposals: [{ path: TONE, value: "Bold", from: "guide.pdf", docId: DOC }] });
    expect(built).toBeNull();
  });

  it("keeps a change the person states in the chat even if a document's was refused", () => {
    const built = buildChangeCard({ versionId: V1, current: kb, refused: new Set([`${DOC}|${TONE}`]), proposals: [{ path: TONE, value: "Bold", from: "You, in this chat", docId: null }] });
    expect(built?.fields).toHaveLength(1);
  });

  it("keeps the first proposal when one field is proposed twice", () => {
    const built = buildChangeCard({
      versionId: V1, current: kb, refused: new Set(),
      proposals: [{ path: TONE, value: "Bold", from: "a.pdf", docId: DOC }, { path: TONE, value: "Soft", from: "b.pdf", docId: DOC }],
    });
    expect(built?.fields.map((f) => f.after)).toEqual(["Bold"]);
  });
});

describe("decideChange", () => {
  const current = { [TONE]: "Warm", [WORDS]: ["cheap"] };

  it("writes each kept field as approved, stated by the person", () => {
    const d = decideChange(card(), { keep: [TONE, WORDS], currentValues: current, activeVersionId: V1 });
    expect(d).toEqual({
      kind: "apply", kept: [TONE, WORDS], outOfDate: [],
      patches: [
        { path: ["brand_profile", "tone_of_voice"], patch: { value: "Warm and plain", status: "approved", evidence_type: "explicit", confidence: "high" } },
        { path: ["compliance", "never_use_words"], patch: { value: ["cheap", "chemical-free"], status: "approved", evidence_type: "explicit", confidence: "high" } },
      ],
    });
  });

  it("writes nothing for a dropped field", () => {
    const d = decideChange(card(), { keep: [TONE], currentValues: current, activeVersionId: V1 });
    expect(d.kind === "apply" && d.patches.map((p) => p.path.join("."))).toEqual([TONE]);
  });

  it("skips a field changed by hand since the card was made, and reports it", () => {
    const d = decideChange(card(), { keep: [TONE, WORDS], currentValues: { ...current, [TONE]: "Typed by hand" }, activeVersionId: V1 });
    expect(d).toMatchObject({ kind: "apply", kept: [WORDS], outOfDate: [TONE] });
  });

  it("says the card is stale when the active KB is a different version", () => {
    expect(decideChange(card(), { keep: [TONE], currentValues: current, activeVersionId: "other" })).toEqual({ kind: "stale" });
    expect(decideChange(card(), { keep: [TONE], currentValues: current, activeVersionId: null })).toEqual({ kind: "stale" });
  });

  it("ignores a kept path that is not on the card", () => {
    const d = decideChange(card(), { keep: ["brand_profile.tagline"], currentValues: current, activeVersionId: V1 });
    expect(d).toEqual({ kind: "apply", kept: [], outOfDate: [], patches: [] });
  });
});

describe("outOfDatePaths", () => {
  it("names the fields whose stored value is no longer what the card showed as before", () => {
    expect(outOfDatePaths(card(), { [TONE]: "Typed", [WORDS]: ["cheap"] })).toEqual([TONE]);
  });
});

describe("refusedKeys", () => {
  const decision = (kept: string[]) => ({ by: "Cyril", byId: null, at: "2026-11-18T00:00:00Z", kept, outOfDate: [] });

  it("remembers every field of a discarded card from a document", () => {
    expect(refusedKeys([card({ status: "discarded", decision: decision([]) })])).toEqual(new Set([`${DOC}|${WORDS}`]));
  });

  it("remembers only the dropped fields of an approved card", () => {
    expect(refusedKeys([card({ status: "applied", decision: decision([WORDS]) })])).toEqual(new Set());
    expect(refusedKeys([card({ status: "applied", decision: decision([TONE]) })])).toEqual(new Set([`${DOC}|${WORDS}`]));
  });

  it("remembers nothing from a chat change, a stale card or a pending card", () => {
    expect(refusedKeys([card(), card({ status: "stale" })])).toEqual(new Set());
  });
});

// ── Piece 2b: a card for what an image study would change ────────────────────

import { buildImageStudyCard, IMAGE_STUDY_FROM, isImageStudyCard, refusedImageValues } from "../card";

describe("image study cards", () => {
  const AES = "image_analysis.aesthetic";
  const MOOD = "image_analysis.visual_mood";
  const withImages = withImageAnalysis(kbWith({}), { aesthetic: { value: "Earthy", status: "approved" }, visual_mood: { value: "Calm", status: "approved" } });
  const studyCard = (over: Partial<ChangeCard> = {}): ChangeCard => ({
    kind: "change", versionId: V1, status: "pending", decision: null,
    fields: [
      { path: AES, label: "Image Analysis · Aesthetic", before: "Earthy", after: "Bold", from: IMAGE_STUDY_FROM, docId: null },
      { path: MOOD, label: "Image Analysis · Visual Mood", before: "Calm", after: "Lively", from: IMAGE_STUDY_FROM, docId: null },
    ],
    ...over,
  });
  const decided = (kept: string[], outOfDate: string[] = []) => ({ by: "Cyril", byId: null, at: "", kept, outOfDate });
  const build = (proposals: { key: string; value: unknown }[], settled: ChangeCard[] = []) =>
    buildImageStudyCard({ versionId: V1, current: withImages, proposals, settled });

  it("makes a card from a study's proposals, sourced to the image study", () => {
    const made = build([{ key: "aesthetic", value: "Bold" }]);
    expect(made).toMatchObject({ kind: "change", versionId: V1, status: "pending", decision: null });
    expect(made?.fields).toEqual([{ path: AES, label: "Image Analysis · Aesthetic", before: "Earthy", after: "Bold", from: "Image study", docId: null }]);
  });

  it("leaves out a value equal to what is stored, and makes no card when nothing is left", () => {
    expect(build([{ key: "aesthetic", value: " Earthy " }])).toBeNull();
    expect(build([])).toBeNull();
  });

  it("leaves out a value the person discarded for that field", () => {
    const settled = [studyCard({ status: "discarded", decision: decided([]) })];
    expect(build([{ key: "aesthetic", value: "Bold" }], settled)).toBeNull();
  });

  it("proposes again when the study reads something different from what was discarded", () => {
    const settled = [studyCard({ status: "discarded", decision: decided([]) })];
    expect(build([{ key: "aesthetic", value: "Minimal" }], settled)?.fields.map((f) => f.after)).toEqual(["Minimal"]);
  });

  it("remembers a field dropped from an approved card, not one kept or left as changed by hand", () => {
    const refused = refusedImageValues([
      studyCard({ status: "applied", decision: decided([AES]) }),                     // mood dropped
      studyCard({ status: "applied", decision: decided([], [AES, MOOD]) }),            // both left: changed by hand
      card({ status: "discarded", decision: decided([]) }),                            // not an image card
      studyCard(),                                                                     // still pending
    ]);
    expect([...refused.keys()]).toEqual([MOOD]);
    expect(refused.get(MOOD)).toEqual(["Lively"]);
  });

  it("isImageStudyCard: true only when every field is an Image Analysis field", () => {
    expect(isImageStudyCard(studyCard())).toBe(true);
    expect(isImageStudyCard(card())).toBe(false);
    expect(isImageStudyCard(studyCard({ fields: [...studyCard().fields, card().fields[0]] }))).toBe(false);
  });

  it("an approved image-study card is applied like any other", () => {
    const d = decideChange(studyCard(), { keep: [AES], currentValues: { [AES]: "Earthy", [MOOD]: "Calm" }, activeVersionId: V1 });
    expect(d).toMatchObject({ kind: "apply", kept: [AES], patches: [{ path: ["image_analysis", "aesthetic"], patch: { value: "Bold", status: "approved" } }] });
  });
});
