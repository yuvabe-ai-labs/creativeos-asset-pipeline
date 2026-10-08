import "server-only";
import { getAvatar } from "@/lib/db/avatars";
import { listPanelPicks, listPanelTakes } from "@/lib/db/script-panels";
import type { Avatar } from "@/lib/avatars/schema";
import type { Script } from "@/lib/scripts/schema";
import { loadKbText } from "./kb-text";
import { parseRegionalKits } from "./kits";
import type { VisualiseBoard } from "./schema";

/** Everything Visualise needs beside the script, read once for the page, the board route and
 *  the draw route alike. Linked avatars are read by id (this client's only, archived included). */
export async function loadVisualiseBoard(clientId: string, script: Script): Promise<VisualiseBoard> {
  const ids = [...new Set(script.doc.cast.map((c) => c.avatarId).filter((id): id is string => Boolean(id)))];
  const [avatars, takes, picks, kbText] = await Promise.all([
    Promise.all(ids.map((id) => getAvatar(clientId, id))).then((list) => list.filter((a): a is Avatar => a !== null)),
    listPanelTakes(script.id),
    listPanelPicks(script.id),
    loadKbText(clientId),
  ]);
  return { avatars, takes, picks, kits: parseRegionalKits(kbText) };
}
