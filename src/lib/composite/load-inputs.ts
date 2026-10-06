import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getAvatar } from "@/lib/db/avatars";
import { presenterUpstreamRows } from "@/lib/avatars/presenter";
import { compositeRefs, type CompositeRef } from "./references";

// D310 — a composite's wired inputs, from the database. An Avatar node holds only an id (D298),
// so its images are read live; archived avatars still resolve (D287 — what already uses an
// avatar keeps working). Each avatar row is replaced, in place, by D308's rows — its front, then
// its fresh profile sheet — so the composite numbers an avatar exactly as a shot does. An avatar
// that cannot contribute a face is an operator problem, said before anything is reserved.

export type CompositeInputs =
  | { ok: true; refs: CompositeRef[]; avatarIds: string[] }
  | { ok: false; error: string };

export async function loadCompositeInputs(nodeId: string, clientId: string): Promise<CompositeInputs> {
  const rows: UpstreamOutput[] = [];
  const avatarIds: string[] = [];
  for (const row of await getUpstreamOutputs(nodeId)) {
    if (row.type !== "avatar") {
      rows.push(row);
      continue;
    }
    const avatarId = typeof row.data.avatarId === "string" ? row.data.avatarId : "";
    const avatar = avatarId ? await getAvatar(clientId, avatarId) : null;
    if (!avatar) {
      return { ok: false, error: "An avatar wired into this composite no longer exists — remove it from the canvas." };
    }
    if (!avatar.front) {
      return { ok: false, error: `${avatar.name} has no front image yet — finish them in the Avatar Studio.` };
    }
    rows.push(...presenterUpstreamRows(row.nodeId, avatar));
    avatarIds.push(avatar.id);
  }
  return { ok: true, refs: compositeRefs(rows), avatarIds };
}
