import type { GenerateState } from "./schema";
import { castStillAsked } from "./suggestions";
import type { VisualiseStep } from "./visualise-walk";

// What a script's copilot panel and its folded rail say the person is waited on (scripting-panel
// spec §3.4), worked out fresh from the script as stored, as on the brand KB (D500).

/** `line` is the whole sentence shown. `reply` and `change` are only on the rail: the question or
 *  the card is already the last thing in the thread. `task` and `client` are also said at its foot. */
export type ScriptWaiting = { kind: "reply" | "change" | "task" | "client"; line: string };

export type ScriptWaitingInput =
  | { stage: "generate"; state: GenerateState; locked: boolean; busy: boolean }
  | { stage: "visualise"; step: VisualiseStep; pendingCard: boolean; busy: boolean }
  | { stage: "in_review" }
  | { stage: "approved"; hasCanvas: boolean };

const you = (kind: ScriptWaiting["kind"], what: string): ScriptWaiting => ({ kind, line: `Waiting for you: ${what}` });

export function scriptWaiting(input: ScriptWaitingInput): ScriptWaiting | null {
  if (input.stage === "approved") return input.hasCanvas ? null : you("task", "create the canvas");
  if (input.stage === "in_review") return { kind: "client", line: "Waiting for the client's review" };
  if (input.stage === "visualise") return visualiseWaiting(input);

  const { state, locked, busy } = input;
  if (busy) return null;
  const cardWaiting = state.messages.some((m) => (m.card?.kind === "proposal" || m.card?.kind === "import") && m.card.status === "pending");
  if (cardWaiting) return you("change", "review the change");
  if (!state.script.doc) return locked ? you("task", "paste your script") : you("reply", "answer the copilot");
  if (castStillAsked(state)) return you("reply", "answer the copilot");
  if (state.openItems.length > 0) return you("task", "settle the open items");
  return you("task", "mark the script final");
}

/** Piece 5.1 §3.6 — at Visualise the line is the walk's current step (visualise-walk.ts). */
function visualiseWaiting({ step, pendingCard, busy }: { step: VisualiseStep; pendingCard: boolean; busy: boolean }): ScriptWaiting | null {
  if (busy) return null;
  if (pendingCard) return you("change", "review the change");
  switch (step.kind) {
    case "cast": return you("task", `choose who plays ${step.name}`);
    case "finish_avatar": return you("task", `finish ${step.name}'s avatar`);
    case "pictures": return you("task", "add the missing pictures");
    case "draw": {
      const n = step.plan.shotIds.length;
      return you("task", `draw ${n} panel${n === 1 ? "" : "s"}`);
    }
    case "drawing": return null;
    case "send": return you("task", "send the storyboard for client review");
  }
}
