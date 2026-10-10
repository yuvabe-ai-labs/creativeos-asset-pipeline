// src/services/script-review.service.ts
import type { PublicScriptReview, TeamScriptReview } from "@/lib/script-review/assemble";
import type { ShareScope, TeamStageMove } from "@/lib/script-review/constants";
import type { Part, ScriptComment } from "@/lib/script-review/types";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";

const send = (url: string, method: "POST" | "PATCH", body: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function readComment(res: Response, fallback: string): Promise<ScriptComment> {
  const { comment } = await readJson<{ comment?: ScriptComment }>(res, fallback);
  if (!comment) throw new Error(fallback);
  return comment;
}

// Script copilot spec 4. Team calls go through the session (/api/clients/:id/scripts/:id/review/…);
// public calls are scoped by the link alone (/api/r/s/:token/…), as D309.
class ScriptReviewService {
  private base(clientId: string, scriptId: string) {
    return `/api/clients/${clientId}/scripts/${scriptId}/review`;
  }

  async getTeam(clientId: string, scriptId: string): Promise<TeamScriptReview> {
    const res = await fetch(this.base(clientId, scriptId), { cache: "no-store" });
    return (await readJson<{ review: TeamScriptReview }>(res, "Could not load the review.")).review;
  }

  /** A team stage move. Moving into In review also shares (D349, refined): it takes the scope and
   *  answers with the version it froze and the link's token. */
  async moveStage(
    clientId: string,
    scriptId: string,
    move: TeamStageMove,
    scope?: ShareScope,
  ): Promise<{ stage: ScriptStage; version?: { number: number; scope: ShareScope; sharedAt: string }; shareToken?: string }> {
    const res = await send(`${this.base(clientId, scriptId)}/stage`, "POST", scope ? { move, scope } : { move });
    return readJson(res, "Could not move the script.");
  }

  async share(
    clientId: string,
    scriptId: string,
    scope: ShareScope,
  ): Promise<{ version: { number: number; scope: ShareScope; sharedAt: string }; shareToken: string }> {
    const res = await send(`${this.base(clientId, scriptId)}/share`, "POST", { scope });
    return readJson<{ version: { number: number; scope: ShareScope; sharedAt: string }; shareToken: string }>(
      res,
      "Could not share the script.",
    );
  }

  async reply(clientId: string, scriptId: string, commentId: string, body: string): Promise<ScriptComment> {
    const res = await send(`${this.base(clientId, scriptId)}/comments/${commentId}/replies`, "POST", { body });
    return readComment(res, "Could not post the reply.");
  }

  async setResolved(clientId: string, scriptId: string, commentId: string, resolved: boolean): Promise<ScriptComment> {
    const res = await send(`${this.base(clientId, scriptId)}/comments/${commentId}`, "PATCH", { resolved });
    return readComment(res, "Could not update the thread.");
  }

  async getPublic(token: string): Promise<PublicScriptReview> {
    const res = await fetch(`/api/r/s/${token}`, { cache: "no-store" });
    return readJson<PublicScriptReview>(res, "Could not load the review.");
  }

  async postComment(
    token: string,
    input: { authorName: string; body: string; part: Part; versionNumber: number },
  ): Promise<ScriptComment> {
    return readComment(await send(`/api/r/s/${token}/comments`, "POST", input), "Could not post the comment.");
  }

  async editComment(token: string, commentId: string, input: { editorName: string; body: string }): Promise<ScriptComment> {
    return readComment(await send(`/api/r/s/${token}/comments/${commentId}`, "PATCH", input), "Could not save the edit.");
  }

  async approve(token: string, input: { approverName: string; versionNumber: number }): Promise<void> {
    await readJson(await send(`/api/r/s/${token}/approve`, "POST", input), "Could not approve the reel.");
  }
}

export const scriptReviewService = new ScriptReviewService();
