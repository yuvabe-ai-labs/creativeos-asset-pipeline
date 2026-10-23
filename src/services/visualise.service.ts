import type { Script } from "@/lib/scripts/schema";
import type { DrawBody, PanelTake, VisualiseBoard } from "@/lib/scripts/visualise/schema";
import type { FrontInput } from "@/lib/scripts/visualise/maker";
import { readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };
const base = (clientId: string, scriptId: string) => `/api/clients/${clientId}/scripts/${scriptId}`;

// Spec 3 — browser calls to Visualise's routes (D300 layer 1).
class VisualiseService {
  async board(clientId: string, scriptId: string): Promise<{ script: Script; board: VisualiseBoard }> {
    const res = await fetch(`${base(clientId, scriptId)}/visualise`);
    return readJson(res, "Could not load the storyboard.");
  }

  async linkCast(clientId: string, scriptId: string, castId: string, avatarId: string | null): Promise<Script> {
    const res = await fetch(`${base(clientId, scriptId)}/cast/${encodeURIComponent(castId)}`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ avatarId }),
    });
    return (await readJson<{ script: Script }>(res, "Could not change the avatar.")).script;
  }

  /** D395 — the cast member and the operator's instructions as a character brief, ready for the
   *  front route. */
  async briefCast(clientId: string, scriptId: string, castId: string, instructions: string): Promise<FrontInput> {
    const res = await fetch(`${base(clientId, scriptId)}/cast/${encodeURIComponent(castId)}/brief`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ instructions }),
    });
    return readJson(res, "Could not describe the person.");
  }

  async reopen(clientId: string, scriptId: string): Promise<Script> {
    const res = await fetch(`${base(clientId, scriptId)}/reopen`, { method: "POST" });
    return (await readJson<{ script: Script }>(res, "Could not reopen the script.")).script;
  }

  async draw(clientId: string, scriptId: string, shotId: string, body: DrawBody): Promise<{ take: PanelTake; pickId: string }> {
    const res = await fetch(`${base(clientId, scriptId)}/panels/${encodeURIComponent(shotId)}`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
    });
    return readJson(res, "Could not draw the panel.");
  }

  async pick(clientId: string, scriptId: string, shotId: string, takeId: string): Promise<{ pickId: string }> {
    const res = await fetch(`${base(clientId, scriptId)}/panels/${encodeURIComponent(shotId)}/pick`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ takeId }),
    });
    return readJson(res, "Could not pick the take.");
  }
}

export const visualiseService = new VisualiseService();
