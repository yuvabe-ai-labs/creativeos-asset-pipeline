import { nextStep } from "./brief";
import type { GenerateState } from "./schema";

// One-tap suggestions above the copilot's message box, for quick demos. Worked out from where the
// conversation is; no model call. A suggestion either sends at once or only fills the box. The
// review is always fill-only: the copilot must never put review text the person did not paste.

export type Suggestion = { label: string; text: string; send: boolean };

const send = (text: string, label = text): Suggestion => ({ label, text, send: true });

/** Demo shortcuts written for Jackfruit 365's reel plan (Reels 04 and 06). They show for every
 *  client for now; swap for starters built from the client's library when the demo is over. */
const DEMO_STARTERS = ["Reel 04, Kerala Piravi, UGC, Saraswathi", "World Diabetes Day, from James, Founder-led"];

export function suggestionsFor(state: GenerateState): Suggestion[] {
  const { script } = state;
  if (script.stage !== "generate") return [];

  if (!script.doc) {
    const step = nextStep(script.brief, false);
    if (step.kind === "ask" && step.piece === "format") return [...DEMO_STARTERS.map((t) => send(t)), send("Take it from here")];
    if (step.kind === "ask" && step.piece === "occasion") return [send("Kerala Piravi, Sun 1 Nov"), send("You pick")];
    if (step.kind === "ask" && step.piece === "lead") return [...state.avatars.slice(0, 3).map((a) => send(a.name)), send("Cast it for me")];
    if (step.kind === "angles") {
      return script.brief.angles.length > 0
        ? [send("Blend A and B"), send("Give me three different angles")]
        : [send("Take it from here")];
    }
    if (step.kind === "confirm") return [send("Write it"), send("Make it lunch instead")];
    return [];
  }

  const out: Suggestion[] = [];
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
