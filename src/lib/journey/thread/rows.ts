import { z } from "zod";
import { attachmentSchema, threadCardSchema, type Attachment, type ThreadMessage } from "./schema";

export type CopilotMessageRow = {
  id: string; role: "user" | "assistant"; content: string;
  card: unknown; attachments: unknown; suggestions: unknown; created_at: string;
};

const chipsSchema = z.array(z.string());

/** A stored row as a thread message. Parts it cannot read (a card kind from a newer build, a
 *  malformed attachment) are dropped, so one bad row never breaks the whole thread. */
export function rowToThreadMessage(row: CopilotMessageRow): ThreadMessage {
  const card = threadCardSchema.safeParse(row.card);
  const suggestions = chipsSchema.safeParse(row.suggestions);
  const attachments: Attachment[] = Array.isArray(row.attachments)
    ? row.attachments.flatMap((a) => {
        const parsed = attachmentSchema.safeParse(a);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    card: card.success ? card.data : null,
    attachments,
    suggestions: suggestions.success ? suggestions.data : [],
    createdAt: row.created_at,
  };
}
