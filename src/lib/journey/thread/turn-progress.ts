import type { KbTurnEvent } from "./turn-events";

// What the panel shows while a turn is running (D502), worked out from the events as they arrive.
// It is only ever on screen during a turn: the thread itself comes from the final `state` event.

/** `step` is the line under the person's message ("Saving the website…"; null means the general
 *  "Working on it…"). `text` is the reply so far; while it is not empty it is shown instead of the line. */
export type TurnProgress = { step: string | null; text: string };

export const NO_PROGRESS: TurnProgress = { step: null, text: "" };

export function applyTurnEvent(progress: TurnProgress, event: KbTurnEvent): TurnProgress {
  switch (event.type) {
    // A step always starts clean: words written before it were not the reply.
    case "step":
      return { step: event.text, text: "" };
    case "text":
      return { step: null, text: progress.text + event.delta };
    case "reset":
    case "state":
    case "error":
      return NO_PROGRESS;
    // A save and a page change are shown by the page beside the chat, not in the thread.
    case "saved":
    case "page":
      return progress;
  }
}
