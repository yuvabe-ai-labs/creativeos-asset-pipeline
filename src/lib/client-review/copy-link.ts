// Browser-only: copies a version's client link and says so. Shared by the focus view's Copy
// button and the node's right-click "Copy vN link". window is read on call, never at render —
// canvas components are server-rendered too.

import { toast } from "sonner";
import { sharePathFor } from "./paths";

export async function copyVersionLink(
  shareToken: string,
  title: string,
  version: { versionNo: number; legacyLink: boolean },
): Promise<void> {
  const label = `v${version.versionNo}`;
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${sharePathFor(shareToken, title, version)}`);
    toast.success(`${label} link copied`);
  } catch {
    toast.error(`Couldn't copy the ${label} link.`);
  }
}
