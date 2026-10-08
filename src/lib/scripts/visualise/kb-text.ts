import "server-only";
import { getActiveKBVersion } from "@/lib/db/kb";
import { collectStrings } from "./kits";

/** D342 — the active brand KB's text, so the kits table is found wherever the house rules were
 *  pasted (spec 2 §4.1). Merge point: when spec 2 adds its house-rules reader, use that here. */
export async function loadKbText(clientId: string): Promise<string> {
  const version = await getActiveKBVersion(clientId);
  return version ? collectStrings(version.output).join("\n\n") : "";
}
