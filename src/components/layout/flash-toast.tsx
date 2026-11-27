"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { FLASH_COOKIE, flashMessage } from "@/lib/auth/flash";

/**
 * Shows the one-time message a server action left in the flash cookie, then deletes it.
 * Checked on every path change, not only on mount: a server action's redirect is a soft
 * navigation, so the root layout (and this) stays mounted across it.
 */
export function FlashToast() {
  const pathname = usePathname();
  useEffect(() => {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
    if (!match) return;
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/`;
    const message = flashMessage(decodeURIComponent(match.slice(FLASH_COOKIE.length + 1)));
    if (message) toast.success(message);
  }, [pathname]);
  return null;
}
