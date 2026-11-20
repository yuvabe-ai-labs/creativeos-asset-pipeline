"use client";

import { toast } from "sonner";
import { CopilotChat } from "@/components/scripts/generate/copilot-chat";
import type { ChatActions } from "@/components/scripts/generate/copilot-chat-message";
import { useGenerateState, useResolveProposal, useSendTurn } from "@/hooks/queries/script-generate";
import { useLinkCast } from "@/hooks/queries/visualise";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { suggestionsFor } from "@/lib/scripts/copilot/suggestions";
import { scriptWaiting } from "@/lib/scripts/copilot/waiting";
import { visualiseStep } from "@/lib/scripts/copilot/visualise-walk";
import { useVisualiseBoardActions } from "./visualise-board-context";

/** Piece 5.1 (D512) — the script's copilot beside the storyboard. Live at Visualise (its message
 *  box, its cards' buttons, the walk's line); read-only In review, as D511. */
export function VisualiseCopilot({ client, initialState }: {
  client: { id: string; name: string; slug: string };
  initialState: GenerateState;
}) {
  const { data: board, model } = useVisualiseBoardActions();
  const scriptId = initialState.script.id;
  const { data: state } = useGenerateState(client.id, scriptId, initialState);
  const turn = useSendTurn(client.id, scriptId);
  const proposal = useResolveProposal(client.id, scriptId);
  const link = useLinkCast(client.id, scriptId);
  const fail = (e: Error) => toast.error(e.message);

  // The board's stage is the fresher one: moving to review refreshes the board, not the thread.
  const stage = board.script.stage;
  const live = stage === "visualise";
  const busy = turn.isPending || proposal.isPending || link.isPending;
  const actions: ChatActions = {
    busy,
    writing: false,
    send: (text) => turn.mutate({ text }, { onError: fail }),
    link: (castId, avatarId) => link.mutate({ castId, avatarId }, { onError: fail }),
    resolve: (messageId, decision) => proposal.mutate({ messageId, decision }, { onError: fail }),
  };
  const step = visualiseStep({ doc: board.script.doc, avatars: model.avatars, views: model.views, plan: model.plan });
  const pendingCard = state.messages.some((m) => m.card?.kind === "proposal" && m.card.status === "pending");
  const waiting = live ? scriptWaiting({ stage: "visualise", step, pendingCard, busy }) : scriptWaiting({ stage: "in_review" });

  return (
    <CopilotChat
      client={client}
      scriptId={scriptId}
      stage={stage}
      messages={state.messages}
      avatars={state.avatars}
      waiting={waiting}
      live={live ? { actions, suggestions: suggestionsFor(state) } : null}
    />
  );
}
