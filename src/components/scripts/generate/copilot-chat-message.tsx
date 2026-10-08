import { cn } from "@/lib/utils";
import type { ScriptMessage } from "@/lib/scripts/copilot/schema";
import { CopilotResearchCard } from "./copilot-research-card";
import { CopilotAnglesCard } from "./copilot-angles-card";
import { CopilotConfirmationCard } from "./copilot-confirmation-card";
import { CopilotProposalCard } from "./copilot-proposal-card";

export type ChatActions = {
  busy: boolean;
  send: (text: string) => void;
  resolve: (messageId: string, decision: "accept" | "reject") => void;
};

export function CopilotChatMessage({ message, actions }: { message: ScriptMessage; actions: ChatActions }) {
  const mine = message.role === "user";
  const { card } = message;
  return (
    <li className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {message.content && (
        <div className={cn("max-w-[92%] whitespace-pre-wrap rounded-2xl text-sm leading-relaxed", mine ? "bg-muted px-3.5 py-2.5" : "px-0.5")}>
          {message.content}
        </div>
      )}
      {card?.kind === "research" && <CopilotResearchCard card={card} />}
      {card?.kind === "angles" && <CopilotAnglesCard angles={card.angles} disabled={actions.busy} onPick={(id) => actions.send(`Go with ${id}.`)} />}
      {card?.kind === "confirmation" && <CopilotConfirmationCard card={card.card} disabled={actions.busy} onWrite={() => actions.send("Write it.")} />}
      {card?.kind === "proposal" && <CopilotProposalCard card={card} disabled={actions.busy} onResolve={(d) => actions.resolve(message.id, d)} />}
    </li>
  );
}
