"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { KBFieldPatch } from "@/lib/kb/field-patch";
import { kbService } from "@/services/kb.service";
import { useRefreshCopilotThread } from "./copilot-thread";

// Writes to a client's brand KB through TanStack Query. The KB itself still reaches the page from
// the server component, so nothing is cached here: these are mutations only. Each one tells the
// copilot thread to re-read, because what the panel says it is waiting on is worked out from the
// stored KB.

/** The review screen's Save: only the fields the person changed. */
export function usePatchKbFields(clientId: string) {
  const refreshThread = useRefreshCopilotThread(clientId);
  return useMutation({
    mutationFn: (body: { versionId: string; patches: KBFieldPatch[] }) => kbService.patchFields(clientId, body),
    // The copilot learns of the save at once: its count, its waiting question and the gate card.
    onSuccess: () => void refreshThread(),
  });
}

/** A person approves the brand KB, from the copilot's gate card. */
export function useApproveKb(clientId: string) {
  const refreshThread = useRefreshCopilotThread(clientId);
  const router = useRouter();
  return useMutation({
    mutationFn: (versionId?: string) => kbService.approve(clientId, versionId),
    onSuccess: () => {
      void refreshThread();
      // The stage tabs and the page beside the panel show the approval too.
      router.refresh();
    },
  });
}
