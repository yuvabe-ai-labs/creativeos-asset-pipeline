import "server-only";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listScripts } from "@/lib/db/scripts";
import { listCopilotAvatars } from "@/lib/db/script-generate";
import { listSignalsWithItems } from "@/lib/db/signals";
import type { Script } from "../schema";
import type { CopilotAvatar } from "./schema";
import { renderKbText, renderSignalBrief, renderSignalDigest, todayLabel } from "./prompt-context";

export type CopilotSignals = { brief: string; digest: string; list: { id: string; name: string }[] };
export type CopilotContext = {
  clientName: string; kbText: string; hasKb: boolean; library: Script[]; avatars: CopilotAvatar[];
  /** "Wed 28 Oct 2026": occasions are suggested for the coming weeks. */
  today: string;
  /** The client's market signals: whole for the angles, as a digest for suggestions. */
  signals: CopilotSignals;
};

const NO_SIGNALS: CopilotSignals = { brief: "", digest: "", list: [] };

/** What the copilot knows without asking (spec 2 §4): the KB with its Content Rules, the client's
 *  scripts (examples, taken reel numbers), its saved avatars, today's date and, for a chat turn, its
 *  market signals. Everything loads together, so nothing new adds a wait (brand-neutral spec §3.6). */
export async function loadCopilotContext(client: { id: string; name: string }, opts: { signals?: boolean } = {}): Promise<CopilotContext> {
  const [version, library, avatars, signals] = await Promise.all([
    getActiveKBVersion(client.id),
    listScripts(client.id),
    listCopilotAvatars(client.id),
    opts.signals ? listSignalsWithItems(client.id) : Promise.resolve(null),
  ]);
  const kb = version ? (version.output as unknown as TraceableBrandKB) : null;
  return {
    clientName: client.name, kbText: renderKbText(kb), hasKb: kb !== null, library, avatars, today: todayLabel(new Date()),
    signals: signals
      ? { brief: renderSignalBrief(signals), digest: renderSignalDigest(signals), list: signals.map((s) => ({ id: s.id, name: s.name })) }
      : NO_SIGNALS,
  };
}
