import type { Script, ScriptDoc } from "../schema";
import { formatSeconds, totalSeconds } from "../timeline";
import { reelLabel, shotSummary } from "../utils";
import { openItemsLine } from "./brief";
import { IMPORT_REPLY_PREFIX, MAX_MESSAGE_CHARS, NARRATOR } from "./constants";
import { toScriptDoc } from "./draft";
import { fillToFinal } from "./fill-to-final";
import { stripFormatting, unmatchedShots } from "./import-check";
import type { ImportOutput } from "./output";
import { nextReelNumber } from "./prompt-context";
import type { CopilotAvatar, ScriptNotes } from "./schema";

// Paste-a-script spec §2–§5 — the model's reading of a pasted script becomes a script, its notes and
// the reply. The rule: what the paste has is used exactly; what it lacks is guessed and asked about.
// Plain code over the model's answer, so each promise is checked here rather than trusted.

/** The cheap gate before the quick model is asked (§5.2): a whole script is long and has many lines.
 *  Short messages, every chip among them, never pay for the check. */
export function mightBeScript(text: string): boolean {
  return text.length > MAX_MESSAGE_CHARS || (text.length >= 400 && text.split("\n").filter((l) => l.trim()).length >= 6);
}

/** A shot the paste gives no timing for: its VO read aloud at about 2.5 words a second, 2 to 10
 *  seconds; 3 for a shot with no VO. */
export function estimateLength(vo: string): number {
  const words = vo.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 3;
  return Math.min(10, Math.max(2, Math.round(words * 0.4)));
}

/** §5.3 — the pasted number, unless another of the client's scripts has it; then the next free one.
 *  This script's own number never counts as taken, so re-pasting a reel over itself keeps it. */
export function resolveReelNumber(pasted: number | null, library: Script[], scriptId: string, fallback: number | null): { reelNumber: number; taken: number | null } {
  const others = library.filter((s) => s.id !== scriptId);
  if (pasted !== null && pasted > 0) {
    const taken = others.some((s) => s.doc.header.reelNumber === pasted);
    return taken ? { reelNumber: nextReelNumber(others), taken: pasted } : { reelNumber: pasted, taken: null };
  }
  return { reelNumber: fallback ?? nextReelNumber(others), taken: null };
}

export function importSummary(doc: ScriptDoc): string {
  return [reelLabel(doc.header.reelNumber), shotSummary(doc)].filter(Boolean).join(" · ");
}

/** "S3", "S3 and S7", "S3, S5 and S7". */
function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Only formatting is removed (§4.1): markdown escapes and bold markers the model left in. */
function clean(out: ImportOutput): ImportOutput {
  const c = (s: string) => stripFormatting(s).trim();
  const h = out.header;
  return {
    ...out,
    header: {
      title: c(h.title), format: c(h.format), region: c(h.region), postDate: c(h.postDate),
      theme: c(h.theme), aspect: c(h.aspect), targetLength: c(h.targetLength), production: c(h.production),
    },
    context: {
      purpose: c(out.context.purpose), settingAndCamera: c(out.context.settingAndCamera),
      disclaimers: c(out.context.disclaimers), watchOuts: out.context.watchOuts.map(c).filter(Boolean),
    },
    cast: out.cast.map((m) => ({ ...m, name: c(m.name), description: c(m.description) })),
    shots: out.shots.map((s) => ({ ...s, beat: c(s.beat), visual: c(s.visual), vo: c(s.vo), onScreenText: c(s.onScreenText) })),
    kept: out.kept.map((k) => ({ name: k.name.trim(), text: c(k.text) })).filter((k) => k.text),
  };
}

export type ImportResult = { doc: ScriptDoc; notes: ScriptNotes; reply: string };

const NOTES_BRIEF_MAX = 8000;

type Guess = { text: string; paths: string[] };

export function buildImport(
  raw: ImportOutput,
  opts: { paste: string; reelNumber: number; takenReel: number | null; avatars: CopilotAvatar[] },
): ImportResult | { error: string } {
  if (!raw.readable) return { error: raw.problem.trim() || "I couldn't find a series of shots or scenes in it." };
  if (raw.shots.length === 0) return { error: "I couldn't find a series of shots or scenes in it." };
  const out = clean(raw);

  // §4.3 — no timing: estimated from the VO. The model returns 0 where the paste has none.
  const untimed = out.shots.flatMap((s, i) => (s.lengthSeconds > 0 ? [] : [i]));
  const shots = out.shots.map((s, i) => (untimed.includes(i) ? { ...s, lengthSeconds: estimateLength(s.vo) } : s));
  // §4.3 — nobody named on screen: a Narrator leads.
  const leadGuessed = out.guessed.lead || out.cast.length === 0;
  const cast = out.cast.length > 0
    ? out.cast.map((m) => ({ ...m, avatarId: null }))
    : [{ key: "narrator", name: NARRATOR, description: "", avatarId: null, isLead: true }];

  let doc: ScriptDoc;
  try {
    // No avatar ids are passed: an import never links an avatar (§4.3, §6).
    doc = toScriptDoc({ header: out.header, context: out.context, cast, shots, summary: out.summary }, { reelNumber: opts.reelNumber, avatarIds: new Set() });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The script didn't hold together." };
  }

  const shotName = (i: number) => `S${i + 1}`;
  const guesses: Guess[] = [];
  const questions: string[] = [];
  if (untimed.length > 0) {
    const paths = untimed.map((i) => `shots.${doc.shots[i].id}.lengthSeconds`);
    if (untimed.length === doc.shots.length) {
      const total = formatSeconds(totalSeconds(doc.shots));
      guesses.push({ text: `Shot lengths were estimated from the VO (about ${total} s in all).`, paths });
      questions.push(`Keep the timings I estimated? There were none in the paste, so I worked them out from the VO (about ${total} s). Or give me the real ones.`);
    } else {
      const names = listOf(untimed.map(shotName));
      guesses.push({ text: `${names} had no timing, so ${untimed.length === 1 ? "its length was" : "their lengths were"} estimated from the VO.`, paths });
      questions.push(`Keep the timings I estimated for ${names}? The paste had none for ${untimed.length === 1 ? "it" : "them"}. Or give me the real ones.`);
    }
  }
  if (out.guessed.beats) {
    const beats = [...new Set(doc.shots.map((s) => s.beat).filter(Boolean))];
    guesses.push({ text: "The beat labels were added by the copilot.", paths: doc.shots.map((s) => `shots.${s.id}.beat`) });
    questions.push(`Are the beat labels right? The paste had none, so I labelled the shots ${listOf(beats)}.`);
  }
  const lead = doc.cast.find((c) => c.isLead)!;
  if (leadGuessed) {
    guesses.push({ text: `Nobody was named on screen, so the lead is ${lead.name}.`, paths: [`cast.${lead.id}.name`, `cast.${lead.id}.description`] });
    questions.push(`Who is on screen? Nobody was named, so I made the lead ${lead.name}.`);
  } else if (opts.avatars.length > 0) {
    // §4.3 — never linked here: the chips under the reply ask (suggestions.ts).
    const names = [lead, ...doc.cast.filter((c) => !c.isLead)].map((c) => c.name);
    questions.push(names.length === 1
      ? `Who plays ${names[0]}? Pick an avatar below, or keep ${names[0]} in words for now.`
      : `Who plays ${listOf(names)}? Pick an avatar below for ${names[0]} first, or keep them in words for now.`);
  }
  // §4.4 — lines the reading changed are named, and listed to check in one open item.
  const mismatches = unmatchedShots(doc, opts.paste);
  if (mismatches.length === 1) {
    const m = mismatches[0];
    const what = m.fields.map((f) => (f === "vo" ? "VO" : "on-screen text")).join(" and ");
    guesses.push({ text: `${shotName(m.index)}'s ${what} doesn't match the pasted script word for word. Check it against the paste.`, paths: m.fields.map((f) => `shots.${m.shotId}.${f}`) });
  } else if (mismatches.length > 1) {
    guesses.push({
      text: `${listOf(mismatches.map((m) => shotName(m.index)))} don't match the pasted script word for word. Check them against the paste.`,
      paths: mismatches.flatMap((m) => m.fields.map((f) => `shots.${m.shotId}.${f}`)),
    });
  }

  // Kept text is never cut silently: past the notes limit the reply says so and an open item remains.
  const keptText = out.kept.length > 0 ? `From the pasted script:\n\n${out.kept.map((k) => k.text).join("\n\n")}` : "";
  const keptCut = keptText.length > NOTES_BRIEF_MAX;
  if (keptCut) guesses.push({ text: "Some of the kept text didn't fit in the notes. Copy the rest from the paste.", paths: [] });

  const notes: ScriptNotes = {
    brief: keptText.slice(0, NOTES_BRIEF_MAX),
    confirmations: guesses.slice(0, 20).map((g, i) => ({ id: `g${i + 1}`, text: g.text.slice(0, 500), confirmed: false, ...(g.paths.length > 0 ? { paths: g.paths } : {}) })),
  };

  const head = [`${IMPORT_REPLY_PREFIX}${importSummary(doc)}.`];
  if (opts.takenReel !== null) head.push(`${reelLabel(opts.takenReel)} is taken, so this is ${reelLabel(doc.header.reelNumber)}.`);
  if (out.kept.length > 0) head.push(`Kept in the notes, word for word: ${listOf(out.kept.map((k) => k.name || "a note"))}.`);
  if (keptCut) head.push("The notes hold 8,000 characters, so the end of what I kept was cut; the rest is still in your paste.");
  if (mismatches.length > 0) {
    const one = mismatches.length === 1;
    head.push(`${listOf(mismatches.map((m) => shotName(m.index)))} ${one ? "doesn't" : "don't"} match the paste word for word, so ${one ? "it's" : "they're"} listed to check.`);
  }
  const reply = [head.join(" "), ...questions, openItemsLine(fillToFinal(doc, notes))].join("\n\n");
  return { doc, notes, reply };
}
