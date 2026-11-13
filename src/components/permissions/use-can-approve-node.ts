"use client";

import { useClientId } from "@/components/canvas/client-id-context";
import { useCan } from "./use-can";

// D507: Approve / Request changes show with Approve on the canvas's client, for every node type.
export function useCanApproveNode(nodeType: string): boolean {
  void nodeType; // one Approve for every node type now; the argument goes in Task 8
  return useCan("approve", useClientId());
}
