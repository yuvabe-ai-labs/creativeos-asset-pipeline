"use client";

import { useAppAbility } from "@/components/permissions/use-can";
import { canInBrowser } from "@/lib/permissions/browser";
import { CLIENT_SECTIONS, type ClientSection } from "./client-sections";

/** The client's sections this person can view, in display order. One filter for every entry point. */
export function useClientSections(clientId: string): ClientSection[] {
  const ability = useAppAbility();
  return CLIENT_SECTIONS.filter((s) => canInBrowser(ability, s.need, clientId));
}
