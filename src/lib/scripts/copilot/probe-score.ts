import type { ScriptDoc } from "../schema";
import { groupByBeat, timeShots, totalSeconds } from "../timeline";
import { carryShot } from "./draft";
import { fillToFinal } from "./fill-to-final";
import { EMPTY_NOTES } from "./schema";
import { REVIEW_PLACEHOLDER } from "./constants";

// Spec 2 §11 / §15 items 2-5 — the mechanical scores for the writing-model probe (Task 5).
// What only a person can judge (the right persona and kit) is read from the printed drafts.

export type ProbeCheck = { name: string; pass: boolean; detail: string };
export type ProbeOptions = {
  founderLed: boolean;
  lockedLines: string[];
  neverList: string[];
  shots: [number, number];
  seconds: [number, number];
};

const UGC_BEATS = ["HOOK", "INTRO", "STORY", "STEP", "REVIEW", "BODY", "PAYOFF", "PROOF", "OUTRO"];
const FIXED = new Set(["HOOK", "INTRO", "PROOF", "OUTRO"]);
const check = (name: string, pass: boolean, detail: string): ProbeCheck => ({ name, pass, detail });
const allText = (doc: ScriptDoc) => [
  ...Object.values(doc.header).map(String), doc.context.purpose, doc.context.settingAndCamera, doc.context.disclaimers,
  ...doc.context.watchOuts, ...doc.cast.flatMap((c) => [c.name, c.description]),
  ...doc.shots.flatMap((s) => [s.beat, s.visual, s.vo, s.onScreenText]),
].join("\n");

export function scoreDraft(doc: ScriptDoc, o: ProbeOptions): ProbeCheck[] {
  const beats = groupByBeat(timeShots(doc.shots)).map((g) => g.beat);
  const seconds = totalSeconds(doc.shots);
  const spoken = doc.shots.map((s) => `${s.vo}\n${s.onScreenText}`).join("\n");
  const text = allText(doc);
  const review = doc.shots.filter((s) => /review/i.test(s.beat));
  const missingLines = o.lockedLines.filter((l) => !spoken.includes(l));
  const hits = o.neverList.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  const lineGaps = fillToFinal(doc, EMPTY_NOTES).filter((i) => /\.(vo|onScreenText)$/.test(i.id) && i.id.startsWith("shots."));
  // Scored as spec 1's seeded-reels test does: a split shot must not repeat its beat's VO line (the
  // parse would map it twice). A repeated card is harmless and seeded Reel 01 keeps one on purpose.
  const carried = doc.shots.every((s, i) => carryShot(doc.shots, i).vo === s.vo);
  const middle = beats.filter((b) => !FIXED.has(b));

  const structure = o.founderLed
    ? beats[0] === "HOOK" && beats.includes("INTRO") && beats.includes("PROOF") && beats.at(-1) === "OUTRO"
      && !beats.includes("REVIEW") && !beats.includes("PAYOFF") && new Set(middle).size === 5
    : beats.join(" ") === UGC_BEATS.join(" ")
      || beats.join(" ") === ["HOOK", "REVIEW", ...UGC_BEATS.filter((b) => b !== "HOOK" && b !== "REVIEW")].join(" ");

  return [
    check("shots", doc.shots.length >= o.shots[0] && doc.shots.length <= o.shots[1], `${doc.shots.length} shots (want ${o.shots[0]}-${o.shots[1]})`),
    check("length", seconds >= o.seconds[0] && seconds <= o.seconds[1], `${seconds}s (want ${o.seconds[0]}-${o.seconds[1]})`),
    check("one lead", doc.cast.filter((c) => c.isLead).length === 1, doc.cast.map((c) => `${c.name}${c.isLead ? " (lead)" : ""}`).join(", ")),
    check("beat lines", lineGaps.length === 0, lineGaps.map((i) => i.label).join("; ") || "every beat's first shot has a VO line and a card"),
    check("carry", carried, carried ? "no split shot repeats its beat's VO line" : "a split shot repeats its beat's VO line"),
    check("structure", structure, beats.join(" › ")),
    check(
      "review placeholder",
      o.founderLed ? review.length === 0 : review.length > 0 && review.some((s) => s.vo.includes(REVIEW_PLACEHOLDER)),
      o.founderLed ? `${review.length} review shots` : review.map((s) => s.vo).join(" | ") || "no review shot",
    ),
    check("locked lines", missingLines.length === 0, missingLines.length ? `missing: ${missingLines.join("; ")}` : "all present verbatim"),
    check("never-list", hits.length === 0, hits.length ? `found: ${hits.join(", ")}` : "none"),
    check("no presenter", !/presenter/i.test(text), "the word must not appear"),
    check("no timecodes", !doc.shots.some((s) => /\b\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*s\b/i.test(`${s.visual} ${s.vo}`)), "lengths only"),
  ];
}

/** Spec 2 §15 item 6 — after "change beat X", only shots of beat X differ; header, context and cast are untouched. */
export function scoreEditIsolation(before: ScriptDoc, after: ScriptDoc, allowedBeat: string): ProbeCheck {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const want = allowedBeat.toUpperCase();
  const outside = (doc: ScriptDoc) => doc.shots.filter((s) => s.beat.trim().toUpperCase() !== want);
  const pass = same(before.header, after.header) && same(before.context, after.context) && same(before.cast, after.cast)
    && same(outside(before), outside(after));
  return check("edit isolation", pass, pass ? `only ${want} changed` : "something outside the asked-for beat changed");
}
