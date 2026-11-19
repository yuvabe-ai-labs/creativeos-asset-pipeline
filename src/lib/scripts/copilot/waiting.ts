import type { GenerateState } from "./schema";
import { castStillAsked } from "./suggestions";

// What a script's copilot panel and its folded rail say the person is waited on (scripting-panel
// spec §3.4), worked out fresh from the script as stored, as on the brand KB (D500).

/** `line` is the whole sentence shown. `reply` and `change` are only on the rail: the question or
 *  the card is already the last thing in the thread. `task` and `client` are also said at its foot. */
export type ScriptWaiting = { kind: "reply" | "change" | "task" | "client"; line: string };

export type ScriptWaitingInput =
  | { stage: "generate"; state: GenerateState; locked: boolean; busy: boolean }
  | { stage: "visualise" | "in_review" }
  | { stage: "approved"; hasCanvas: boolean };

const you = (kind: ScriptWaiting["kind"], what: string): ScriptWaiting => ({ kind, line: `Waiting for you: ${what}` });

export function scriptWaiting(input: ScriptWaitingInput): ScriptWaiting | null {
  if (input.stage === "visualise") return you("task", "finish the storyboard and send it for review");
  if (input.stage === "in_review") return { kind: "client", line: "Waiting for the client's review" };
  if (input.stage === "approved") return input.hasCanvas ? null : you("task", "create the canvas");

  const { state, locked, busy } = input;
  if (busy) return null;
  const cardWaiting = state.messages.some((m) => (m.card?.kind === "proposal" || m.card?.kind === "import") && m.card.status === "pending");
  if (cardWaiting) return you("change", "review the change");
  if (!state.script.doc) return locked ? you("task", "paste your script") : you("reply", "answer the copilot");
  if (castStillAsked(state)) return you("reply", "answer the copilot");
  if (state.openItems.length > 0) return you("task", "settle the open items");
  return you("task", "mark the script final");
}
