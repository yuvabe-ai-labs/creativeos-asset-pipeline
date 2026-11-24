import type { KbSaved } from "@/lib/journey/kb-copilot/turn";
import type { Attachment, ThreadState } from "@/lib/journey/thread/schema";
import type { KbTurnEvent } from "@/lib/journey/thread/turn-events";
import { readJson } from "./read-json";
import type { SignalDraftDecision } from "@/lib/journey/thread/schema";
import { readNdjson } from "./read-ndjson";

const COULD_NOT_ANSWER = "The copilot could not answer.";

export type KbTurnBody = { text: string; attachments: Attachment[] };
/** `saved` is the website or handles the turn stored, for the form beside the chat to show at once. */
export type KbTurnResult = { state: ThreadState; changed: boolean; saved: KbSaved };

// The copilot's saved onboarding thread (D508). One read for every stage page; a turn is sent to
// the stage's own agent.
class CopilotThreadService {
  async thread(clientId: string): Promise<ThreadState> {
    const res = await fetch(`/api/clients/${clientId}/copilot/thread`);
    return readJson<ThreadState>(res, "The copilot could not be loaded.");
  }

  /** One message to the brand KB copilot. The answer arrives as event lines while the turn runs
   *  (D514): each goes to `onEvent`, and the last one is the result. `changed` is true when the
   *  turn saved or started something. A refusal is plain JSON and is thrown as its message. */
  async kbTurn(clientId: string, body: KbTurnBody, onEvent?: (event: KbTurnEvent) => void): Promise<KbTurnResult> {
    const res = await fetch(`/api/clients/${clientId}/copilot/kb/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) return readJson<KbTurnResult>(res, COULD_NOT_ANSWER);
    const got: { result: KbTurnResult | null } = { result: null };
    await readNdjson<KbTurnEvent>(res.body, (event) => {
      onEvent?.(event);
      if (event.type === "state") got.result = { state: event.state, changed: event.changed, saved: event.saved };
      else if (event.type === "error") throw new Error(event.error || COULD_NOT_ANSWER);
    });
    if (!got.result) throw new Error(COULD_NOT_ANSWER);
    return got.result;
  }

  /** A person approves (keeping the fields in `keep`) or discards a change card (D517). */
  async decideChange(clientId: string, messageId: string, body: { decision: "approve"; keep: string[] } | { decision: "discard" }): Promise<{ state: ThreadState }> {
    const res = await fetch(`/api/clients/${clientId}/copilot/changes/${messageId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson<{ state: ThreadState }>(res, "Could not apply that change.");
  }

  /** A person confirms a brands card (D530): the handles in `keep` are fetched. With `fetch: false`
   *  only its switches are stored, so a confirm in the chat fetches what the card shows on. */
  async confirmBrands(clientId: string, messageId: string, keep: string[], opts: { fetch?: boolean } = {}): Promise<{ state: ThreadState }> {
    const res = await fetch(`/api/clients/${clientId}/copilot/brands/${messageId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep, fetch: opts.fetch ?? true }),
    });
    return readJson<{ state: ThreadState }>(res, "Could not start bringing in their posts.");
  }

  /** A person keeps (as edited) or drops a drafted signal (D530). */
  async decideSignalDraft(clientId: string, messageId: string, body: SignalDraftDecision): Promise<{ state: ThreadState; signalId?: string }> {
    const res = await fetch(`/api/clients/${clientId}/copilot/signal-drafts/${messageId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson<{ state: ThreadState; signalId?: string }>(res, "Could not save that signal.");
  }
}

export const copilotThreadService = new CopilotThreadService();
