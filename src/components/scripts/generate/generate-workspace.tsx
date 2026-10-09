"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useGenerateState, useResolveProposal, useSendTurn } from "@/hooks/queries/script-generate";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import type { PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import { suggestionsFor } from "@/lib/scripts/copilot/suggestions";
import { CopilotChat } from "./copilot-chat";
import { GenerateScriptPane } from "./generate-script-pane";

/** Spec 2 §3 — the Generate workspace: the copilot on the left, the script on the right. */
export function GenerateWorkspace({ clientId, initialState }: { clientId: string; initialState: GenerateState }) {
  const scriptId = initialState.script.id;
  const { data: state } = useGenerateState(clientId, scriptId, initialState);
  // The first draft streams in here while the copilot writes it, and clears once the turn ends.
  const [draft, setDraft] = useState<PartialDraft | null>(null);
  const turn = useSendTurn(clientId, scriptId, setDraft);
  const proposal = useResolveProposal(clientId, scriptId);
  const fail = (e: Error) => toast.error(e.message);

  const actions = {
    busy: turn.isPending || proposal.isPending,
    send: (text: string, leadAvatarId?: string) => turn.mutate({ text, leadAvatarId }, { onError: fail, onSettled: () => setDraft(null) }),
    resolve: (messageId: string, decision: "accept" | "reject") => proposal.mutate({ messageId, decision }, { onError: fail }),
  };

  return (
    <div className="grid min-h-0 flex-1 items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <CopilotChat scriptId={scriptId} messages={state.messages} actions={actions} suggestions={suggestionsFor(state)} avatars={state.avatars} />
      <GenerateScriptPane clientId={clientId} state={state} chatBusy={actions.busy} draft={draft} />
    </div>
  );
}
