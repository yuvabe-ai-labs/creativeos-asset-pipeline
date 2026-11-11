import type { AppAbility } from "./ability";
import { canInBrowser } from "./browser";

// D489 Downloads. UI ONLY: files sit in public storage buckets, so these ticks hide download
// buttons but cannot stop someone who has a file's URL. Making the buckets private is its own
// project (spec §5.2). View = approved finals; Share = anything, drafts included.
export function canDownload(ability: AppAbility, clientId: string, approved: boolean): boolean {
  if (canInBrowser(ability, "downloads.share", clientId)) return true;
  return approved && canInBrowser(ability, "downloads.view", clientId);
}
