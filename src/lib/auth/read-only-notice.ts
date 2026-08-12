"use client";

import { toast } from "sonner";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/lib/auth/constants";

// The write-gate blocks non-elevated impersonated writes server-side with a 403, but
// every client call site wraps that in its OWN generic failure message — canvas
// autosave, for instance, says "Couldn't save the canvas … Retrying automatically."
// So the operator saw a misleading error, or nothing at all, instead of the real
// reason. Detecting it once here, at the shared authFetch funnel, means no call site
// has to know the gate exists.
export async function notifyIfReadOnlyBlocked(res: Response): Promise<void> {
  if (res.status !== 403) return;

  try {
    // clone() so the caller still gets an unread body to parse itself.
    const body = await res.clone().json();
    if (body?.error !== IMPERSONATION_READ_ONLY_MESSAGE) return;
  } catch {
    return; // not a JSON body — not our gate
  }

  toast.error("Editing is disabled", {
    description:
      "You're viewing as another organization. Enable editing in the banner to make changes.",
    // A blocked action often fires several requests at once (autosave retries, a
    // batch mutation). One toast, not a stack of identical ones.
    id: "impersonation-read-only",
  });
}
