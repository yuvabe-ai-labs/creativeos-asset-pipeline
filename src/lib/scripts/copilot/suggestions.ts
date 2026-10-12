import { isFounderLed, nextStep } from "./brief";
import { avatarLabel } from "./avatar-label";
import { NARRATOR } from "./import";
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

export function suggestionsFor(state: GenerateState): Suggestion[] {
  const { script } = state;
  if (script.stage !== "generate") return [];

  if (!script.doc) {
    const step = nextStep(script.brief, false);
    if (step.kind === "ask" && step.piece === "format") return [...state.formats.map((f) => send(f)), send("Take it from here")];
    if (step.kind === "ask" && step.piece === "occasion") return [send("Kerala Piravi, Sun 1 Nov"), send("You pick")];
    if (step.kind === "ask" && step.piece === "lead") {
      // A Founder-led reel's lead is the founder: the client's real-person (Specific) avatars first.
      const founder = isFounderLed(script.brief.format.value);
      const order = founder ? [...state.avatars].sort((a, b) => Number(b.specific) - Number(a.specific)) : state.avatars;
      return [
        ...order.map((a) => ({ label: avatarLabel(a, state.avatars), text: a.name, send: true, leadAvatarId: a.id })),
        send("Cast it for me"),
      ];
    }
    if (step.kind === "angles") {
      return script.brief.angles.length > 0
        ? [send("Blend A and B"), send("Give me three different angles")]
        : [send("Take it from here")];
    }
    if (step.kind === "confirm") return [send("Write it"), send("Make it lunch instead")];
    return [];
  }

  const out: Suggestion[] = [];
  // After an import the copilot asked who plays whom: the avatars for the first character still in
  // words (the lead first), a fitting one first. A guessed Narrator is asked about in words instead.
  const member = script.brief.imported
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

  const hasReview = script.doc.shots.some((s) => /review/i.test(s.beat));
  out.push(send("Make the hook punchier"));
  if (hasReview) out.push(send("Redo the payoff, warmer"), send("Move the review earlier"));
  else out.push(send("Make the ending warmer"));
  return out;
}
