import "server-only";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listScripts } from "@/lib/db/scripts";
import { listCopilotAvatars } from "@/lib/db/script-generate";
import { listSignalsWithItems } from "@/lib/db/signals";
import type { Script } from "../schema";
import type { CopilotAvatar } from "./schema";
import { renderKbText, renderSignalBrief } from "./prompt-context";

export type CopilotContext = { clientName: string; kbText: string; hasKb: boolean; library: Script[]; avatars: CopilotAvatar[] };

/** What the copilot knows without asking (spec 2 §4): the KB with the house rules, the client's
 *  scripts (formats, examples, taken reel numbers), and its saved avatars. */
export async function loadCopilotContext(client: { id: string; name: string }): Promise<CopilotContext> {
  const [version, library, avatars] = await Promise.all([
    getActiveKBVersion(client.id),
    listScripts(client.id),
    listCopilotAvatars(client.id),
  ]);
  const kb = version ? (version.output as unknown as TraceableBrandKB) : null;
  return { clientName: client.name, kbText: renderKbText(kb), hasKb: kb !== null, library, avatars };
}

/** Market Research (spec 2 §6): every signal the client has, every time angles are proposed. */
export async function loadSignals(clientId: string): Promise<{ brief: string; signals: { id: string; name: string }[] }> {
  const signals = await listSignalsWithItems(clientId);
  return { brief: renderSignalBrief(signals), signals: signals.map((s) => ({ id: s.id, name: s.name })) };
}
