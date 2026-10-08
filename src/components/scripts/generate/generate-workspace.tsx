"use client";

import { toast } from "sonner";
import { useGenerateState, useResolveProposal, useSendTurn } from "@/hooks/queries/script-generate";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { CopilotChat } from "./copilot-chat";
import { GenerateScriptPane } from "./generate-script-pane";

/** Spec 2 §3 — the Generate workspace: the copilot on the left, the script on the right. */
export function GenerateWorkspace({ clientId, initialState }: { clientId: string; initialState: GenerateState }) {
  const scriptId = initialState.script.id;
  const { data: state } = useGenerateState(clientId, scriptId, initialState);
  const turn = useSendTurn(clientId, scriptId);
  const proposal = useResolveProposal(clientId, scriptId);
  const fail = (e: Error) => toast.error(e.message);

  const actions = {
    busy: turn.isPending || proposal.isPending,
    send: (text: string) => turn.mutate(text, { onError: fail }),
    resolve: (messageId: string, decision: "accept" | "reject") => proposal.mutate({ messageId, decision }, { onError: fail }),
  };

  return (
    <div className="grid min-h-0 flex-1 items-start gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <CopilotChat messages={state.messages} actions={actions} />
      <GenerateScriptPane clientId={clientId} state={state} chatBusy={actions.busy} />
    </div>
  );
}
