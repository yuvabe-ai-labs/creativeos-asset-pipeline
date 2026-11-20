"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CopilotPictureComposer } from "./copilot-picture-composer";
import { useScriptFollow } from "./script-follow-context";
import { changedTargets } from "@/lib/scripts/copilot/changed-targets";
import { CopilotChat } from "@/components/scripts/generate/copilot-chat";
import type { ChatActions } from "@/components/scripts/generate/copilot-chat-message";
import { useGenerateState, useResolveProposal, useSendTurn } from "@/hooks/queries/script-generate";
import { useLinkCast } from "@/hooks/queries/visualise";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { suggestionsFor } from "@/lib/scripts/copilot/suggestions";
import { scriptWaiting } from "@/lib/scripts/copilot/waiting";
import { visualiseStep } from "@/lib/scripts/copilot/visualise-walk";
import { useTeamScriptReview } from "@/hooks/queries/script-review";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { CopilotOfferCard } from "./copilot-offer-card";
import { CopilotSendCard } from "./copilot-send-card";
import { CopilotStepCard } from "./copilot-step-card";
import { useVisualiseBoardActions } from "./visualise-board-context";
import { sendMissing } from "@/lib/scripts/copilot/visualise-walk";

/** Piece 5.1 (D512) — the script's copilot beside the storyboard. Live at Visualise (its message
 *  box, its cards' buttons, the walk's line); read-only In review, as D511. */
export function VisualiseCopilot({ client, initialState, initialReview }: {
  client: { id: string; name: string; slug: string };
  initialState: GenerateState;
  initialReview: TeamScriptReview;
}) {
  const { data: board, model } = useVisualiseBoardActions();
  const scriptId = initialState.script.id;
  const { data: state } = useGenerateState(client.id, scriptId, initialState);
  const turn = useSendTurn(client.id, scriptId);
  const proposal = useResolveProposal(client.id, scriptId);
  const link = useLinkCast(client.id, scriptId);
  const fail = (e: Error) => toast.error(e.message);
  // §3.8 — what a copilot change touched lands on the board. Compared with the board as it was when
  // the message went, so a change the person made meanwhile is not shown as the copilot's.
  const follow = useScriptFollow();
  const landing = () => {
    const before = board.script.doc;
    return (next: GenerateState) => { if (next.script.doc) follow?.land(changedTargets(before, next.script.doc)); };
  };
  // The step card's "Attach a picture" on an item opens the composer's picker for that item.
  const [attach, setAttach] = useState<{ target: string; n: number } | null>(null);
  // Seeded from the page, shared with the board's review actions: no request of its own.
  const latest = useTeamScriptReview(client.id, initialState.script.id, initialReview).data?.latest ?? null;

  // The board's stage is the fresher one: moving to review refreshes the board, not the thread.
  const stage = board.script.stage;
  const live = stage === "visualise";
  const busy = turn.isPending || proposal.isPending || link.isPending;
  const pendingCard = state.messages.some((m) => m.card?.kind === "proposal" && m.card.status === "pending");
  const actions: ChatActions = {
    busy,
    writing: false,
    send: (text) => turn.mutate({ text }, { onError: fail, onSuccess: landing() }),
    link: (castId, avatarId) => link.mutate({ castId, avatarId }, { onError: fail, onSuccess: () => follow?.land([`cast:${castId}`]) }),
    resolve: (messageId, decision) => proposal.mutate({ messageId, decision }, { onError: fail, onSuccess: landing() }),
    renderOffer: (card) => <CopilotOfferCard clientId={client.id} card={card} latest={latest} pendingCard={pendingCard} />,
  };
  const walk = { doc: board.script.doc, avatars: model.avatars, views: model.views, plan: model.plan };
  const step = visualiseStep(walk);
  const footer = !live ? null : step.kind === "send"
    ? <CopilotSendCard clientId={client.id} script={board.script} latest={latest} missing={sendMissing({ ...walk, pendingCard })} />
    : <CopilotStepCard clientId={client.id} step={step} avatars={state.avatars} onAttach={(target) => setAttach((a) => ({ target, n: (a?.n ?? 0) + 1 }))} />;
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
      footer={footer}
      renderComposer={(box) => (
        <CopilotPictureComposer
          {...box}
          clientId={client.id}
          scriptId={scriptId}
          doc={board.script.doc}
          request={attach}
          onSend={(message) => {
            const landed = landing();
            turn.mutate(message, {
              onError: fail,
              onSuccess: (next) => { landed(next); if (message.picture) follow?.land([message.picture.target]); },
            });
          }}
        />
      )}
    />
  );
}
