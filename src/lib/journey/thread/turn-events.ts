import type { KbSaved } from "@/lib/journey/kb-copilot/turn";
import type { ThreadState } from "./schema";

// What a brand KB turn sends to the browser while it runs (D502, D503): one JSON object per line,
// the same wire format the script copilot's first draft uses (D337). The last line is always
// `state` or `error`. `state` carries exactly what the turn used to answer with in one piece, so a
// reader that ignored every other line would still end up right.
export type KbTurnEvent =
  /** The copilot has started a step that changes the page: "Saving the website…". */
  | { type: "step"; text: string }
  /** The next piece of the reply, as it is written. */
  | { type: "text"; delta: string }
  /** The words sent so far were not the reply after all: the copilot went on to do something. */
  | { type: "reset" }
  /** A website or handles were just stored, as the form shows them. */
  | { type: "saved"; saved: KbSaved }
  /** Something else on the page was just written (a field of the KB, a build): re-read it. */
  | { type: "page" }
  | { type: "state"; state: ThreadState; changed: boolean; saved: KbSaved }
  | { type: "error"; error: string };

export const NDJSON_HEADERS = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } as const;
