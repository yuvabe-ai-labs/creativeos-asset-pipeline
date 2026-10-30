import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getAvatar } from "@/lib/db/avatars";
import { presenterUpstreamRows } from "@/lib/avatars/presenter";
import { isScriptAssetNodeType, scriptAssetRows } from "@/lib/scripts/asset-nodes";
import { compositeRefs, type CompositeRef } from "./references";
import { compositeContextOf, type CompositeContext } from "./context";

// D312 — a composite's wired inputs, from the database. An Avatar node holds only an id (D298),
// so its images are read live; archived avatars still resolve (D287 — what already uses an
// avatar keeps working). Each avatar row is replaced, in place, by D308's rows — its front, then
// its fresh profile sheet — so the composite numbers an avatar exactly as a shot does. An avatar
// that cannot contribute a face is an operator problem, said before anything is reserved.

// D320 — a wired Script, Shot or Multishot node is context, not an image: collected apart.

export type CompositeInputs =
  | { ok: true; refs: CompositeRef[]; avatarIds: string[]; contexts: CompositeContext[] }
  | { ok: false; error: string };

export async function loadCompositeInputs(nodeId: string, clientId: string): Promise<CompositeInputs> {
  const rows: UpstreamOutput[] = [];
  const avatarIds: string[] = [];
  const contexts: CompositeContext[] = [];
  for (const row of await getUpstreamOutputs(nodeId)) {
    const context = compositeContextOf(row.nodeId, row.type, row.data, row.activeOutput);
    if (context) {
      contexts.push(context);
      continue;
    }
    // D454 — a script's product or location is its pictures, as everywhere else (D450): before,
    // a Product node wired into a composite sent nothing at all.
    if (isScriptAssetNodeType(row.type)) {
      rows.push(...scriptAssetRows(row));
      continue;
    }
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
  return { ok: true, refs: compositeRefs(rows), avatarIds, contexts };
}
