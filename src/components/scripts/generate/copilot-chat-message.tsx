import { cn } from "@/lib/utils";
import type { CopilotAvatar, ScriptMessage } from "@/lib/scripts/copilot/schema";
import { messageParagraphs } from "@/lib/scripts/copilot/message-text";
import { CopilotResearchCard, researchRows } from "./copilot-research-card";
import { CopilotAnglesCard } from "./copilot-angles-card";
import { CopilotConfirmationCard } from "./copilot-confirmation-card";
import { CopilotProposalCard } from "./copilot-proposal-card";

export type ChatActions = {
  busy: boolean;
  /** `leadAvatarId` when a lead chip sends the message (D362). */
  send: (text: string, leadAvatarId?: string) => void;
  resolve: (messageId: string, decision: "accept" | "reject") => void;
};

export function CopilotChatMessage({ message, actions, avatars }: { message: ScriptMessage; actions: ChatActions; avatars: CopilotAvatar[] }) {
  const mine = message.role === "user";
  const { card } = message;
  // Research that no angle drew on says nothing worth a card; a message that is only that card goes.
  const research = card?.kind === "research" && researchRows(card).length > 0 ? card : null;
  if (!message.content && card?.kind === "research" && !research) return null;
  return (
    <li className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {message.content && (mine ? (
        <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed">{message.content}</div>
      ) : (
        <CopilotText content={message.content} />
      ))}
      {research && <CopilotResearchCard card={research} />}
      {card?.kind === "angles" && <CopilotAnglesCard angles={card.angles} disabled={actions.busy} onPick={(id) => actions.send(`Go with ${id}.`)} />}
      {card?.kind === "confirmation" && <CopilotConfirmationCard card={card.card} avatars={avatars} disabled={actions.busy} onWrite={() => actions.send("Write it.")} />}
      {card?.kind === "proposal" && <CopilotProposalCard card={card} disabled={actions.busy} onResolve={(d) => actions.resolve(message.id, d)} />}
    </li>
  );
}

/** The copilot's words. Its question stands out from the rest of the message (one size up, medium
 *  weight), with the hint after it back at body size. */
function CopilotText({ content }: { content: string }) {
  return (
    <div className="flex max-w-[92%] flex-col gap-3 px-0.5 text-sm leading-relaxed">
      {messageParagraphs(content).map((p, i) =>
        p.kind === "question" ? (
          <div key={i} className="flex flex-col gap-0.5">
            <p className="text-base font-medium leading-snug text-foreground">{p.question}</p>
            {p.hint && <p className="whitespace-pre-wrap text-muted-foreground">{p.hint}</p>}
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap">{p.text}</p>
        ),
      )}
    </div>
  );
}
