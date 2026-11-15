import { CopilotText } from "@/components/copilot/copilot-text";
import { PersonText } from "@/components/copilot/person-text";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { cn } from "@/lib/utils";
import { ThreadAttachmentChip } from "./thread-attachment-chip";
import { ThreadStatusLines } from "./thread-status-lines";

/** One message of a copilot thread, the same in every stage: the words, what was attached, and
 *  the card. Later parts add the gate card and the change card here. */
export function ThreadMessageItem({ message }: { message: ThreadMessage }) {
  const mine = message.role === "user";
  return (
    <li className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {message.card?.kind === "status" && <ThreadStatusLines lines={message.card.lines} />}
      {message.content && (mine ? <PersonText content={message.content} /> : <CopilotText content={message.content} />)}
      {message.attachments.length > 0 && (
        <div className={cn("flex max-w-[92%] flex-wrap gap-1.5", mine && "justify-end")}>
          {message.attachments.map((a) => <ThreadAttachmentChip key={a.id} name={a.name} url={a.url} />)}
        </div>
      )}
    </li>
  );
}
