"use client";

import { useClientId } from "@/components/canvas/client-id-context";
import { approveKeyForNodeType } from "@/lib/permissions/node-area";
import { canInBrowser } from "@/lib/permissions/browser";
import { useAppAbility } from "./use-can";

// D489: Approve / Request changes show only with Approve on the node's area, for the canvas's
// client. For a canvas focus view (it reads the client from the canvas tree).
export function useCanApproveNode(nodeType: string): boolean {
  const ability = useAppAbility();
  const clientId = useClientId();
  const key = approveKeyForNodeType(nodeType);
  return key !== null && canInBrowser(ability, key, clientId);
}
