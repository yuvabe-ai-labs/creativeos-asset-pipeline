"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getAvatars, subscribeAvatars, type SavedAvatar } from "@/lib/avatars/local-store";

/** The client's browser-saved avatars; `null` during server render / before hydration. */
export function useSavedAvatars(clientId: string): SavedAvatar[] | null {
  const snapshot = useCallback(() => getAvatars(clientId), [clientId]);
  return useSyncExternalStore(subscribeAvatars, snapshot, () => null);
}
