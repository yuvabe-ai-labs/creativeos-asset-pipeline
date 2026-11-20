import type { GenerateState } from "@/lib/scripts/copilot/schema";
import type { PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";
import { readNdjson } from "./read-ndjson";

// Script copilot spec 2 — browser calls to the Generate routes. No caching here (TanStack Query owns it).

const scriptUrl = (clientId: string, scriptId: string) => `/api/clients/${clientId}/scripts/${scriptId}`;
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** One chat message; `leadAvatarId` when a lead chip sent it (D362). */
export type TurnMessage = {
  text: string; leadAvatarId?: string;
  /** Piece 5.1 — a picture already put on its product or location, at Visualise. */
  picture?: { url: string; name: string; target: string };
};

class ScriptGenerateService {
  async create(clientId: string): Promise<string> {
    const res = await send(`/api/clients/${clientId}/scripts`, "POST");
    return (await readJson<{ scriptId: string }>(res, "Could not start a new script.")).scriptId;
  }

  /** Delete from the library, for good (D384). The route refuses, with the reason as the error, a script a canvas or the client depends on. */
  async remove(clientId: string, scriptId: string): Promise<void> {
    const res = await send(scriptUrl(clientId, scriptId), "DELETE");
    await readJson<{ ok: true }>(res, "Could not delete the script.");
  }

  async state(clientId: string, scriptId: string): Promise<GenerateState> {
    const res = await fetch(`${scriptUrl(clientId, scriptId)}/generate`);
    return (await readJson<{ state: GenerateState }>(res, "Could not load the script.")).state;
  }

  /** One chat message. The answer streams as newline-delimited JSON (D337, refined): draft previews
   *  go to `onDraft` as they arrive; the final line is the whole workspace state. */
  async turn(clientId: string, scriptId: string, message: TurnMessage, onDraft?: (draft: PartialDraft) => void): Promise<GenerateState> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/turn`, "POST", message);
    if (!res.ok || !res.body) return (await readJson<{ state: GenerateState }>(res, "The copilot could not answer.")).state;
    const got: { state: GenerateState | null } = { state: null };
    await readNdjson<{ type: string; draft?: PartialDraft; state?: GenerateState; error?: string }>(res.body, (msg) => {
      if (msg.type === "draft" && msg.draft) onDraft?.(msg.draft);
      else if (msg.type === "state" && msg.state) got.state = msg.state;
      else if (msg.type === "error") throw new Error(msg.error ?? "The copilot could not answer.");
    });
    if (!got.state) throw new Error("The copilot could not answer.");
    return got.state;
  }

  async setField(clientId: string, scriptId: string, path: string, value: string): Promise<GenerateState> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/fields`, "PATCH", { path, value });
    return (await readJson<{ state: GenerateState }>(res, "Could not save that change.")).state;
  }

  async inlineEdit(
    clientId: string, scriptId: string,
    body: { path: string; selectedText: string; offset: number; instruction: string },
  ): Promise<{ state: GenerateState; undo: { path: string; before: string } }> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/inline-edit`, "POST", body);
    return readJson(res, "Could not make that edit.");
  }

  async resolveProposal(clientId: string, scriptId: string, messageId: string, decision: "accept" | "reject"): Promise<GenerateState> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/proposals/${messageId}`, "POST", { decision });
    return (await readJson<{ state: GenerateState }>(res, "Could not apply that change.")).state;
  }

  async linkAvatar(clientId: string, scriptId: string, castId: string, avatarId: string | null): Promise<GenerateState> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/cast/${encodeURIComponent(castId)}`, "PATCH", { avatarId });
    return (await readJson<{ state: GenerateState }>(res, "Could not change the avatar.")).state;
  }

  async markFinal(clientId: string, scriptId: string): Promise<ScriptStage> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/mark-final`, "POST");
    return (await readJson<{ stage: ScriptStage }>(res, "Could not mark the script final.")).stage;
  }
}

export const scriptGenerateService = new ScriptGenerateService();
