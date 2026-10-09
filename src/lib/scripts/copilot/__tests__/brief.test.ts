import { describe, it, expect } from "vitest";
import {
  angleText, applyAngle, cardToNotes, isFounderLed, mergeExtraction, nextStep, normalizeAngles, normalizeCard,
  openingMessage, openItemsLine, questionFor,
} from "../brief";
import { EMPTY_BRIEF, type Angle, type Brief } from "../schema";
import type { Extraction } from "../output";

const AVATAR = "7a2d3c4e-0000-4000-8000-000000000002";
const none = { action: "none" as const, value: "" };
const ex = (over: Partial<Extraction> = {}): Extraction => ({
  format: none, occasion: { ...none, postDate: "" }, lead: { ...none, avatarId: null }, narrative: { ...none, angleId: null },
  skipAll: false, reelNumber: null, confirm: false, cardChange: "", ack: "", ...over,
});
const angle = (id: string, over: Partial<Angle> = {}): Angle => ({
  id, hook: `Hook ${id}`, situation: `Situation ${id}`, mealMoment: "Lunch, curd", supportingCast: "Husband", reviewTheme: "Everyday ease",
  proofEmphasis: "Origin line", format: "", occasion: "", postDate: "", lead: "", leadAvatarId: null, signalIds: [], fromSignals: "", ...over,
});
const given = (value: string) => ({ value, status: "given" as const });
const merge = (b: Brief, e: Extraction) => mergeExtraction(b, e, new Set([AVATAR])).brief;

describe("nextStep: a fixed order, skipping anything already given", () => {
  it("asks format, then occasion, then lead, then proposes angles, then the card, then waits to confirm", () => {
    let b: Brief = EMPTY_BRIEF;
    expect(nextStep(b, false)).toEqual({ kind: "ask", piece: "format" });
    b = { ...b, format: given("UGC") };
    expect(nextStep(b, false)).toEqual({ kind: "ask", piece: "occasion" });
    b = { ...b, occasion: given("Kerala Piravi") };
    expect(nextStep(b, false)).toEqual({ kind: "ask", piece: "lead" });
    b = { ...b, lead: given("Saraswathi") };
    expect(nextStep(b, false)).toEqual({ kind: "angles" });
    b = { ...b, narrative: given("A. Hook A: Situation A") };
    expect(nextStep(b, false)).toEqual({ kind: "card" });
    b = { ...b, card: { title: "t", reelNumber: 4, lines: [], cast: [], toConfirm: [] } };
    expect(nextStep(b, false)).toEqual({ kind: "confirm" });
    expect(nextStep(b, true)).toEqual({ kind: "edit" });
  });

  it("goes straight to the angles when one message gives format, occasion and lead", () => {
    const b = merge(EMPTY_BRIEF, ex({
      format: { action: "given", value: "UGC" },
      occasion: { action: "given", value: "Kerala Piravi", postDate: "Sun 1 Nov" },
      lead: { action: "given", value: "Saraswathi", avatarId: null },
      reelNumber: 4,
    }));
    expect(nextStep(b, false)).toEqual({ kind: "angles" });
    expect(b.reelNumber).toBe(4);
    expect(b.postDate).toBe("Sun 1 Nov");
  });

  it("asks who leads every format, Founder-led too (D362: the founder is picked as a saved avatar)", () => {
    const b = { ...EMPTY_BRIEF, format: given("Founder-led"), occasion: given("World Diabetes Day") };
    expect(nextStep(b, false)).toEqual({ kind: "ask", piece: "lead" });
    expect(isFounderLed("Founder-led option")).toBe(true);
    expect(isFounderLed("UGC, review first")).toBe(false);
  });

  it("treats skipped pieces as settled, and skipping everything still reaches the angles", () => {
    expect(nextStep(merge(EMPTY_BRIEF, ex({ format: { action: "skip", value: "" } })), false)).toEqual({ kind: "ask", piece: "occasion" });
    const all = merge(EMPTY_BRIEF, ex({ skipAll: true }));
    expect([all.format.status, all.occasion.status, all.lead.status, all.narrative.status]).toEqual(["skipped", "skipped", "skipped", "skipped"]);
    expect(nextStep(all, false)).toEqual({ kind: "angles" });
  });

  it('"take the narrative and generate the rest" goes straight to the card', () => {
    const b = merge(EMPTY_BRIEF, ex({ narrative: { action: "given", value: "A couple's Piravi lunch", angleId: null }, skipAll: true }));
    expect(b.narrative).toEqual(given("A couple's Piravi lunch"));
    expect(nextStep(b, false)).toEqual({ kind: "card" });
  });
});

describe("mergeExtraction", () => {
  it("picks a proposed angle by letter and fills the skipped pieces from it as proposed", () => {
    const b: Brief = {
      ...EMPTY_BRIEF, format: given("UGC"), occasion: given("Kerala Piravi"), lead: { value: "", status: "skipped" },
      angles: [angle("A", { lead: "Saraswathi", leadAvatarId: AVATAR }), angle("B")],
    };
    const out = merge(b, ex({ narrative: { action: "given", value: "", angleId: "a" } }));
    expect(out.narrative).toEqual({ value: "A. Hook A: Situation A", status: "given" });
    expect(out.lead).toEqual({ value: "Saraswathi", status: "proposed" });
    expect(out.leadAvatarId).toBe(AVATAR);
    expect(out.format).toEqual(given("UGC")); // given pieces are never overwritten by a proposal
  });

  it("keeps a lead's avatar only when it is one of the client's", () => {
    const ok = merge(EMPTY_BRIEF, ex({ lead: { action: "given", value: "James", avatarId: AVATAR } }));
    expect(ok.leadAvatarId).toBe(AVATAR);
    const bad = merge(EMPTY_BRIEF, ex({ lead: { action: "given", value: "James", avatarId: "not-ours" } }));
    expect(bad.leadAvatarId).toBeNull();
  });

  it("reports a change and a card change, so the card is rebuilt", () => {
    const b = { ...EMPTY_BRIEF, format: given("UGC"), card: { title: "t", reelNumber: 4, lines: [], cast: [], toConfirm: [] } };
    expect(mergeExtraction(b, ex({ cardChange: "make it dinner" }), new Set()).cardChange).toBe("make it dinner");
    expect(mergeExtraction(b, ex({ format: { action: "given", value: "UGC, review first" } }), new Set()).changed).toBe(true);
    expect(mergeExtraction(b, ex({ confirm: true }), new Set()).changed).toBe(false);
  });

  it("ignores a reel number that is not a positive whole number", () => {
    expect(merge(EMPTY_BRIEF, ex({ reelNumber: 0 })).reelNumber).toBeNull();
  });
});

describe("re-reading a pick", () => {
  it("counts picking the angle that is already the narrative as no change, and a new pick as one", () => {
    const a = angle("A");
    const b: Brief = { ...EMPTY_BRIEF, angles: [a, angle("B")], narrative: { value: angleText(a), status: "given" } };
    const again = mergeExtraction(b, ex({ narrative: { action: "given", value: "", angleId: "A" } }), new Set());
    expect(again.changed).toBe(false);
    const other = mergeExtraction(b, ex({ narrative: { action: "given", value: "", angleId: "B" } }), new Set());
    expect(other.changed).toBe(true);
    expect(other.brief.narrative.value).toBe(angleText(angle("B")));
  });
});

describe("normalising what the model proposed", () => {
  it("keeps three angles lettered A to C, and drops avatar ids that are not real", () => {
    const out = normalizeAngles(
      [angle("x", { leadAvatarId: "nope" }), angle("y"), angle("z"), angle("w")],
      [{ id: "sig-1" }], new Set([AVATAR]),
    );
    expect(out.map((a) => a.id)).toEqual(["A", "B", "C"]);
    expect(out[0].leadAvatarId).toBeNull();
  });

  it("reads the signal handles the prompt gave (S1, S2…) back into real signal ids, once each", () => {
    const [a] = normalizeAngles([angle("x", { signalIds: ["S2", "s1", "S9", "ghost", "S2", "S0"] })], [{ id: "sig-1" }, { id: "sig-2" }], new Set());
    expect(a.signalIds).toEqual(["sig-2", "sig-1"]);
  });

  it("gives the card exactly one lead, the app's reel number, and real avatar ids only", () => {
    const card = normalizeCard(
      { title: " ", reelNumber: 99, lines: [], toConfirm: [" a ", ""], cast: [
        { name: "Saraswathi", role: "lead", isLead: false, avatarId: AVATAR },
        { name: "Rajan", role: "husband", isLead: false, avatarId: "ghost" },
      ] },
      { reelNumber: 4, avatarIds: new Set([AVATAR]) },
    );
    expect(card.cast.map((c) => c.isLead)).toEqual([true, false]);
    expect(card.cast.map((c) => c.avatarId)).toEqual([AVATAR, null]);
    expect(card.reelNumber).toBe(4);
    expect(card.title).toBe("Untitled reel");
    expect(card.toConfirm).toEqual(["a"]);
  });

  it("puts the avatar the person picked on the card's lead, whatever the model wrote", () => {
    const card = normalizeCard(
      { title: "t", reelNumber: 1, lines: [], toConfirm: [], cast: [{ name: "Meenakshi", role: "lead", isLead: true, avatarId: null }] },
      { reelNumber: 10, avatarIds: new Set([AVATAR]), lead: { avatarId: AVATAR, name: "James" } },
    );
    expect(card.cast[0]).toMatchObject({ name: "James", avatarId: AVATAR, isLead: true });
  });
});

describe("the copilot's own words", () => {
  it("opens by saying what it works from and asks for the format", () => {
    const text = openingMessage({ clientName: "Jackfruit365", formats: ["UGC", "Founder-led"], hasKb: true });
    expect(text).toContain("Jackfruit365's brand KB");
    expect(text).toMatch(/What format is this reel\? Pick one below/);
    // The formats are chips, not prose: a label like "UGC, review first" breaks a comma list.
    expect(text).not.toContain("UGC");
    expect(text).not.toMatch(/region/i);
  });

  it("asks for a described format when the library has none", () => {
    const text = openingMessage({ clientName: "Jackfruit365", formats: [], hasKb: false });
    expect(text).toContain("Jackfruit365 has no brand KB yet");
    expect(text).not.toContain("Pick one below");
  });

  it("points at the avatar chips when asking who leads, without naming them again", () => {
    const text = questionFor("lead", { formats: [], avatars: [{ id: "a", name: "Meenakshi", story: "", front: null, specific: false }] });
    expect(text).toBe("Who leads? Pick an avatar below or name someone new.");
  });

  it("turns the confirmed card into the reel's notes, with each item to confirm", () => {
    const notes = cardToNotes({
      title: "Kerala Piravi at our table", reelNumber: 4,
      lines: [{ label: "Format", value: "UGC", source: "given" }, { label: "Post date", value: "Sun 1 Nov", source: "proposed" }],
      cast: [{ name: "Saraswathi", role: "reacts to the review", isLead: true, avatarId: null }],
      toConfirm: ["Sun 1 Nov is Kerala Piravi"],
    });
    expect(notes.brief).toContain("Reel 04");
    expect(notes.brief).toContain("Post date: Sun 1 Nov (proposed)");
    expect(notes.brief).toContain("Saraswathi (lead)");
    expect(notes.confirmations).toEqual([{ id: "c1", text: "Sun 1 Nov is Kerala Piravi", confirmed: false }]);
  });

  it("says what is still open, or that it is ready", () => {
    expect(openItemsLine([])).toMatch(/ready to mark final/);
    expect(openItemsLine([{ id: "x", label: "L", question: "Paste the review.", path: null }])).toBe("1 thing to settle before it's final. First: Paste the review.");
  });

  it("applyAngle never overwrites what the person gave", () => {
    const b = applyAngle({ ...EMPTY_BRIEF, occasion: given("Onam") }, angle("A", { occasion: "Kerala Piravi" }), "proposed");
    expect(b.occasion).toEqual(given("Onam"));
    expect(b.narrative.status).toBe("proposed");
  });
});
