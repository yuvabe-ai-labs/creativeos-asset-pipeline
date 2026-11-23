import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { CopilotAvatar, OfferCard, ScriptMessage } from "@/lib/scripts/copilot/schema";
import { CopilotText } from "@/components/copilot/copilot-text";
import { PersonText } from "@/components/copilot/person-text";
import { CopilotResearchCard, researchRows } from "./copilot-research-card";
import { CopilotAnglesCard } from "./copilot-angles-card";
import { CopilotConfirmationCard } from "./copilot-confirmation-card";
import { CopilotProposalCard } from "./copilot-proposal-card";
import { CopilotImportCard } from "./copilot-import-card";

export type ChatActions = {
  busy: boolean;
  /** The first draft is being written, its skeleton on the right (D367). */
  writing?: boolean;
  /** `leadAvatarId` when a lead chip sends the message (D362). */
  send: (text: string, leadAvatarId?: string) => void;
  resolve: (messageId: string, decision: "accept" | "reject") => void;
  /** Links an avatar to a character, from a chip after an import (paste-a-script §4.3). */
  link: (castId: string, avatarId: string) => void;
  /** Piece 5.1 — at Visualise, the button a reply offered (draw, send, reopen), drawn live. */
  renderOffer?: (card: OfferCard) => ReactNode;
};

const OFFERED: Record<OfferCard["action"], string> = {
  draw: "Offered to draw the panels", send: "Offered to send for client review", reopen: "Offered to reopen the script",
};

/** `actions: null` after Generate: the cards are shown without their buttons, which only apply there. */
export function CopilotChatMessage({ message, actions, avatars }: { message: ScriptMessage; actions: ChatActions | null; avatars: CopilotAvatar[] }) {
  const mine = message.role === "user";
  const { card } = message;
  const busy = actions?.busy ?? false;
  // Research that no angle drew on says nothing worth a card; a message that is only that card goes.
  const research = card?.kind === "research" && researchRows(card).length > 0 ? card : null;
  if (!message.content && card?.kind === "research" && !research) return null;
  return (
    <li className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {message.content && (mine ? (
        <PersonText content={message.content} />
      ) : (
        <CopilotText content={message.content} />
      ))}
      {research && <CopilotResearchCard card={research} />}
      {card?.kind === "angles" && <CopilotAnglesCard angles={card.angles} disabled={busy} onPick={actions ? (id) => actions.send(`Go with ${id}.`) : undefined} />}
      {card?.kind === "confirmation" && <CopilotConfirmationCard card={card.card} avatars={avatars} disabled={busy} onWrite={actions ? () => actions.send("Write it.") : undefined} />}
      {card?.kind === "proposal" && <CopilotProposalCard card={card} disabled={busy} onResolve={actions ? (d) => actions.resolve(message.id, d) : undefined} />}
      {card?.kind === "import" && <CopilotImportCard card={card} disabled={busy} onResolve={actions ? (d) => actions.resolve(message.id, d) : undefined} />}
      {card?.kind === "picture" && (
        <figure className="flex flex-col items-end gap-1">
          <img src={card.url} alt="" className="max-h-40 rounded-lg border border-border object-cover" />
          <figcaption className="text-xs text-muted-foreground">{card.name}</figcaption>
        </figure>
      )}
      {card?.kind === "offer" && (actions?.renderOffer
        ? actions.renderOffer(card)
        : <span className="text-xs text-muted-foreground">{OFFERED[card.action]}</span>)}
    </li>
  );
}
