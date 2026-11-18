"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { KB_NOT_READY_MESSAGE, KB_REQUIRED_PARAM } from "@/lib/clients/kb-gate";

/**
 * Says why the user landed on the KB page when Scripts or Avatars sent them here (D503), then
 * drops the flag from the URL so a reload or a shared link doesn't repeat it. The fixed toast
 * id keeps a double effect run (dev Strict Mode) to one toast.
 */
export function KBRequiredToast() {
  useEffect(() => {
    toast.info(KB_NOT_READY_MESSAGE, { id: "kb-required" });
    const url = new URL(window.location.href);
    url.searchParams.delete(KB_REQUIRED_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
