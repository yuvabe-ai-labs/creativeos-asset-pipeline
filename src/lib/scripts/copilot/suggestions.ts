import { nextStep } from "./brief";
import { formatFor } from "./formats";
import { avatarLabel } from "./avatar-label";
import { IMPORT_REPLY_PREFIX, NARRATOR } from "./constants";
import type { CopilotAvatar, GenerateState } from "./schema";

// One-tap suggestions above the copilot's message box, for quick demos. Worked out from where the
// conversation is; no model call. A suggestion either sends at once or only fills the box. The
// review is always fill-only: the copilot must never put review text the person did not paste.

/** `leadAvatarId` goes with the message when the chip picks the lead, so the turn links that exact
 *  avatar instead of the model matching a name (two avatars can share one; D362). `link` makes a chip
 *  that links an avatar to a character instead of sending a message (an import asks who plays whom;
 *  paste-a-script §4.3). Only a tap links: nothing is linked unasked. */
export type Suggestion = { label: string; text: string; send: boolean; leadAvatarId?: string; link?: { castId: string; avatarId: string } };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (word: string, text: string) => word.length > 1 && new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(text);

/** An avatar that plainly fits a character: either's name is a whole word in the other's name or words. */
export function avatarFits(member: { name: string; description: string }, avatar: CopilotAvatar): boolean {
  return hasWord(avatar.name.trim(), `${member.name} ${member.description}`) || hasWord(member.name.trim(), `${avatar.name} ${avatar.story}`);
}

const send = (text: string, label = text): Suggestion => ({ label, text, send: true });

/** The most chips one message offers, and the longest one (brand-neutral spec §3.1). */
const MAX_CHIPS = 4;
const MAX_CHIP_CHARS = 80;

/** What the model suggested, made safe to show: trimmed, no empties, nothing too long, no repeats
 *  (case aside), nothing a code chip already offers, at most four. */
export function cleanSuggestions(raw: readonly unknown[], taken: readonly string[] = []): string[] {
  const seen = new Set(taken.map((t) => t.trim().toLowerCase()));
  const out: string[] = [];
  for (const chip of raw) {
    const text = typeof chip === "string" ? chip.trim() : "";
    const key = text.toLowerCase();
    if (!text || text.length > MAX_CHIP_CHARS || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === MAX_CHIPS) break;
  }
  return out;
}

/** The chips the copilot wrote for this brand: those of its newest reply that has any, looking back
 *  no further than the person's last message (an inline edit or an accepted proposal posts a reply
 *  with none, and must not clear the edits on offer). */
function modelChips(state: GenerateState, taken: readonly string[]): Suggestion[] {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role === "user") break;
    if (m.suggestions.length) return cleanSuggestions(m.suggestions, taken).map((t) => send(t));
  }
  return [];
}

export function suggestionsFor(state: GenerateState): Suggestion[] {
  const { script } = state;
  if (script.stage !== "generate") return [];

  if (!script.doc) {
    const step = nextStep(script.brief, false);
    if (step.kind === "ask" && step.piece === "format") return [...state.formats.map((f) => send(f)), send("Take it from here")];
    if (step.kind === "ask" && step.piece === "occasion") return [...modelChips(state, ["You pick"]), send("You pick")];
    if (step.kind === "ask" && step.piece === "lead") {
      // A format whose lead is a real person (Founder-led): the client's real-person (Specific) avatars first.
      const founder = formatFor(script.brief.format.value)?.realPersonLead ?? false;
      const order = founder ? [...state.avatars].sort((a, b) => Number(b.specific) - Number(a.specific)) : state.avatars;
      return [
        ...order.map((a) => ({ label: avatarLabel(a, state.avatars), text: a.name, send: true, leadAvatarId: a.id })),
        send("Cast it for me"),
      ];
    }
    if (step.kind === "angles") return script.brief.angles.length > 0 ? modelChips(state, []) : [send("Take it from here")];
    if (step.kind === "confirm") return [send("Write it"), ...modelChips(state, ["Write it"])];
    return [];
  }

  const out: Suggestion[] = [];
  // After an import the copilot asked who plays whom: the avatars for the first character still in
  // words (the lead first), a fitting one first. A guessed Narrator is asked about in words instead.
  // The chips stay only while the import's reply is the newest message; a link posts no message, so
  // they move on to the next character, and any later message ends the question.
  const last = state.messages.at(-1);
  const asking = script.brief.imported && last?.role === "assistant" && last.content.startsWith(IMPORT_REPLY_PREFIX);
  const member = asking
    ? [...script.doc.cast].sort((a, b) => Number(b.isLead) - Number(a.isLead)).find((c) => !c.avatarId && c.name !== NARRATOR)
    : undefined;
  if (member && state.avatars.length > 0) {
    const ranked = [...state.avatars].sort((a, b) => Number(avatarFits(member, b)) - Number(avatarFits(member, a)));
    out.push(...ranked.map((a) => ({ label: `${avatarLabel(a, state.avatars)} as ${member.name}`, text: "", send: false, link: { castId: member.id, avatarId: a.id } })));
  }
  if (state.openItems.some((i) => i.id.startsWith("placeholder.") && /review/i.test(i.question))) {
    out.push({ label: "Paste the cleared review", text: "Here's the cleared review: \"", send: false });
  }
  const confirm = script.notes.confirmations.find((c) => !c.confirmed);
  if (confirm) out.push(send(`Yes, confirmed: ${confirm.text}`, `Confirm: ${confirm.text}`));

  // Edits come from the copilot, written for this brand; none are fixed text.
  out.push(...modelChips(state, out.map((c) => c.text)));
  return out;
}
