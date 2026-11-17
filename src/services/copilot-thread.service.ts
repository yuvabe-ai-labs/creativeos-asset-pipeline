import type { KbSaved } from "@/lib/journey/kb-copilot/turn";
import type { Attachment, ThreadState } from "@/lib/journey/thread/schema";
import { readJson } from "./read-json";

export type KbTurnBody = { text: string; attachments: Attachment[] };
/** `saved` is the website or handles the turn stored, for the form beside the chat to show at once. */
export type KbTurnResult = { state: ThreadState; changed: boolean; saved: KbSaved };

// The copilot's saved onboarding thread (D496). One read for every stage page; a turn is sent to
// the stage's own agent.
class CopilotThreadService {
  async thread(clientId: string): Promise<ThreadState> {
    const res = await fetch(`/api/clients/${clientId}/copilot/thread`);
    return readJson<ThreadState>(res, "The copilot could not be loaded.");
  }

  /** One message to the brand KB copilot. `changed` is true when it saved or started something. */
  async kbTurn(clientId: string, body: KbTurnBody): Promise<KbTurnResult> {
    const res = await fetch(`/api/clients/${clientId}/copilot/kb/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson<KbTurnResult>(res, "The copilot could not answer.");
  }
}

export const copilotThreadService = new CopilotThreadService();
