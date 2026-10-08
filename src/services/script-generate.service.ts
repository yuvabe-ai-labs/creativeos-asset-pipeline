import type { GenerateState } from "@/lib/scripts/copilot/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";

// Script copilot spec 2 — browser calls to the Generate routes. No caching here (TanStack Query owns it).

const scriptUrl = (clientId: string, scriptId: string) => `/api/clients/${clientId}/scripts/${scriptId}`;
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

class ScriptGenerateService {
  async create(clientId: string): Promise<string> {
    const res = await send(`/api/clients/${clientId}/scripts`, "POST");
    return (await readJson<{ scriptId: string }>(res, "Could not start a new script.")).scriptId;
  }

  async state(clientId: string, scriptId: string): Promise<GenerateState> {
    const res = await fetch(`${scriptUrl(clientId, scriptId)}/generate`);
    return (await readJson<{ state: GenerateState }>(res, "Could not load the script.")).state;
  }

  async turn(clientId: string, scriptId: string, text: string): Promise<GenerateState> {
    const res = await send(`${scriptUrl(clientId, scriptId)}/turn`, "POST", { text });
    return (await readJson<{ state: GenerateState }>(res, "The copilot could not answer.")).state;
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
