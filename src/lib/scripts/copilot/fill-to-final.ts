import type { ScriptDoc } from "../schema";
import { groupByBeat, timeShots } from "../timeline";
import { HEADER_LABEL } from "./fields";
import type { OpenItem, ScriptNotes } from "./schema";

// Spec 2 §8 — "Final means ready for the client to read." Everything still standing between the
// script and Final, in reading order. A plain check of the script and its notes, not a model call
// (formats model §3.3). Rules held in the KB as text are not checked here (spec 2 §8).

/** Square brackets mark a placeholder only the person can fill (the copilot is told so). */
export const PLACEHOLDER_RE = /\[[^\]\n]{2,160}\]/;

export function findPlaceholder(text: string): string | null {
  return text.match(PLACEHOLDER_RE)?.[0] ?? null;
}

/** The header line every outline has. Theme is left out on purpose: the outlines' header line has
 *  no theme slot, and seeded Reel 06 has none. */
const HEADER_FIELDS = ["title", "format", "region", "postDate", "aspect", "targetLength", "production"] as const;

export function fillToFinal(doc: ScriptDoc | null, notes: ScriptNotes): OpenItem[] {
  if (!doc) return [{ id: "draft", label: "First draft", question: "Finish the brief and I'll write the first draft.", path: null }];
  const items: OpenItem[] = [];
  const add = (id: string, label: string, question: string, path: string | null = id) => items.push({ id, label, question, path });
  const placeholder = (path: string, where: string, text: string, isReview: boolean) => {
    const found = findPlaceholder(text);
    if (!found) return;
    add(
      `placeholder.${path}`,
      `${where}: placeholder`,
      isReview
        ? `Paste a real, cleared Amazon review for ${where}, on the theme its visual names. If none fits, tell me and I'll swap the theme.`
        : `Replace ${found} in ${where}.`,
      path,
    );
  };

  for (const field of HEADER_FIELDS) {
    const label = HEADER_LABEL[field];
    if (!doc.header[field].trim()) add(`header.${field}`, label, `What's the ${label.toLowerCase()} for this reel?`);
    else placeholder(`header.${field}`, label, doc.header[field], false);
  }

  const context = [
    ["purpose", "Purpose", "What is this reel for? I can propose a Purpose line."],
    ["settingAndCamera", "Setting and camera", "Where is it set, and how is it shot? I can propose this from the lead's home and kit."],
    ["disclaimers", "Disclaimers", "Which disclaimers apply? If none does, the script should say so."],
  ] as const;
  for (const [field, label, question] of context) {
    if (!doc.context[field].trim()) add(`context.${field}`, label, question);
    else placeholder(`context.${field}`, label, doc.context[field], false);
  }
  if (doc.context.watchOuts.length === 0) add("context.watchOuts", "Watch-outs", "What should the team watch out for on this reel?", null);
  doc.context.watchOuts.forEach((w, i) => placeholder(`context.watchOuts.${i}`, `Watch-out ${i + 1}`, w, false));

  for (const c of doc.cast) {
    if (!c.description.trim()) add(`cast.${c.id}.description`, `Character: ${c.name}`, `Describe ${c.name}: age, place, clothing, voice.`);
    else placeholder(`cast.${c.id}.description`, `Character: ${c.name}`, c.description, false);
  }

  const firstOfBeat = new Set(groupByBeat(timeShots(doc.shots)).map((g) => g.shots[0].shot.id));
  doc.shots.forEach((s, i) => {
    const where = `${s.beat.trim() || "The shot"} (S${i + 1})`;
    const isReview = /review/i.test(s.beat);
    if (!s.beat.trim()) add(`shots.${s.id}.beat`, `S${i + 1}: beat`, `Which beat is S${i + 1}?`);
    if (!s.visual.trim()) add(`shots.${s.id}.visual`, `S${i + 1}: visual`, `What do we see in S${i + 1}?`);
    else placeholder(`shots.${s.id}.visual`, where, s.visual, false);
    if (firstOfBeat.has(s.id)) {
      if (!s.vo.trim()) add(`shots.${s.id}.vo`, `${where}: VO line`, `What's the VO line for ${where}?`);
      if (!s.onScreenText.trim()) add(`shots.${s.id}.onScreenText`, `${where}: on-screen text`, `What's the on-screen card for ${where}?`);
    }
    placeholder(`shots.${s.id}.vo`, where, s.vo, isReview || /review/i.test(s.vo));
    placeholder(`shots.${s.id}.onScreenText`, where, s.onScreenText, false);
  });

  for (const c of notes.confirmations) {
    if (!c.confirmed) add(`confirm.${c.id}`, "To confirm", `Confirm: ${c.text}`, `notes.confirm.${c.id}`);
  }
  return items;
}
