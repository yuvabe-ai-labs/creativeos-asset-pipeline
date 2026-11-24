import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { CopilotText } from "@/components/copilot/copilot-text";
import { PersonText } from "@/components/copilot/person-text";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { cn } from "@/lib/utils";
import { ThreadAttachmentChip } from "./thread-attachment-chip";
import { ThreadStatusLines } from "./thread-status-lines";
import { ThreadChangeCard, type ChangeDecision } from "./thread-change-card";
import { ThreadBrandsCard } from "./thread-brands-card";
import { ThreadSignalDraftCard } from "./thread-signal-draft-card";
import type { SignalDraftDecision } from "@/lib/journey/thread/schema";

/** One message of a copilot thread, the same in every stage: the words, what was attached, and
 *  the card. A later part adds the change card here. */
export function ThreadMessageItem({ message, change, market, footer }: {
  message: ThreadMessage;
  /** How a change card in this thread is settled; a stage with no change cards leaves it out. */
  change?: { busy: boolean; onDecide: (messageId: string, decision: ChangeDecision) => void };
  /** How the market agent's cards are settled (D530): a brands card confirmed, a draft kept or dropped. */
  market?: {
    busy: boolean;
    onConfirmBrands: (messageId: string, keep: string[]) => void;
    onDecideDraft: (messageId: string, decision: SignalDraftDecision) => void;
  };
  /** Under the message: the trace of the turn that wrote it, with the developer switch on (D521). */
  footer?: ReactNode;
}) {
  const mine = message.role === "user";
  // Something that happened, not something said: who approved, or a save on the page. One quiet
  // line with a tick, in place of the copilot's words.
  if (message.card?.kind === "approval" || message.card?.kind === "note") {
    return (
      <li className="flex items-start gap-2 text-sm font-medium text-success-text">
        <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <span>{message.content}</span>
      </li>
    );
  }
  return (
    <li className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {message.card?.kind === "status" && <ThreadStatusLines lines={message.card.lines} />}
      {message.card?.kind === "change" && change && (
        <ThreadChangeCard id={message.id} card={message.card} outOfDate={message.outOfDate} busy={change.busy} onDecide={(d) => change.onDecide(message.id, d)} />
      )}
      {message.card?.kind === "brands" && market && (
        <ThreadBrandsCard id={message.id} card={message.card} busy={market.busy} onConfirm={(keep) => market.onConfirmBrands(message.id, keep)} />
      )}
      {message.card?.kind === "signal-draft" && market && (
        <ThreadSignalDraftCard id={message.id} card={message.card} busy={market.busy} onDecide={(d) => market.onDecideDraft(message.id, d)} />
      )}
      {/* Which field a question is about, above the question itself. */}
      {message.card?.kind === "question" && <p className="text-eyebrow px-0.5 text-muted-foreground">{message.card.label}</p>}
      {message.content && (mine ? <PersonText content={message.content} /> : <CopilotText content={message.content} />)}
      {message.attachments.length > 0 && (
        <div className={cn("flex max-w-[92%] flex-wrap gap-1.5", mine && "justify-end")}>
          {message.attachments.map((a) => <ThreadAttachmentChip key={a.id} name={a.name} url={a.url} />)}
        </div>
      )}
      {footer}
    </li>
  );
}
