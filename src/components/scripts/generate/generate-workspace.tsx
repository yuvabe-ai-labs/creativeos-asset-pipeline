"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useGenerateState, useLinkCastAvatar, useResolveProposal, useSendTurn } from "@/hooks/queries/script-generate";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import { suggestionsFor } from "@/lib/scripts/copilot/suggestions";
import { CopilotChat } from "./copilot-chat";
import { GenerateScriptPane } from "./generate-script-pane";
import { GenerateReviewColumn, GenerateReviewProvider } from "./generate-review";
import { cn } from "@/lib/utils";

/** Spec 2 §3 — the Generate workspace: the copilot on the left, the script on the right. */
export function GenerateWorkspace({ clientId, initialState, initialReview }: { clientId: string; initialState: GenerateState; initialReview: TeamScriptReview | null }) {
  const scriptId = initialState.script.id;
  const { data: state } = useGenerateState(clientId, scriptId, initialState);
  // The first draft streams in here while the copilot writes it, and clears once the turn ends.
  const [draft, setDraft] = useState<PartialDraft | null>(null);
  const turn = useSendTurn(clientId, scriptId, setDraft);
  const proposal = useResolveProposal(clientId, scriptId);
  const avatarLink = useLinkCastAvatar(clientId, scriptId);
  const fail = (e: Error) => toast.error(e.message);

  // D489 — a reopened script the client commented on keeps the board's Comments column, from `xl`
  // beside the script (20rem, as on the board), below it in a sheet.
  const doc = state.script.doc;

  const actions = {
    busy: turn.isPending || proposal.isPending || avatarLink.isPending,
    writing: draft !== null,
    send: (text: string, leadAvatarId?: string) => turn.mutate({ text, leadAvatarId }, { onError: fail, onSettled: () => setDraft(null) }),
    link: (castId: string, avatarId: string) => avatarLink.mutate({ castId, avatarId }, { onError: fail }),
    resolve: (messageId: string, decision: "accept" | "reject") => proposal.mutate({ messageId, decision }, { onError: fail }),
  };

  const grid = (
    <div className={cn("grid min-h-0 flex-1 items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]", doc && initialReview && "xl:grid-cols-[auto_minmax(0,1fr)_20rem]")}>
      <CopilotChat scriptId={scriptId} messages={state.messages} actions={actions} suggestions={suggestionsFor(state)} avatars={state.avatars} />
      <GenerateScriptPane clientId={clientId} state={state} chatBusy={actions.busy} draft={draft} reviewed={Boolean(doc && initialReview)} />
      {doc && initialReview && <GenerateReviewColumn clientId={clientId} scriptId={scriptId} />}
    </div>
  );

  return doc && initialReview ? (
    <GenerateReviewProvider clientId={clientId} scriptId={scriptId} doc={doc} initialReview={initialReview}>{grid}</GenerateReviewProvider>
  ) : grid;
}
