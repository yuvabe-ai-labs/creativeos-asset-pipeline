import { z } from "zod";

// The shape of a copilot thread message, the same for every stage (journey map §2 and §5). A stage
// supplies its own agent and tools; what the panel renders is always this.

export const attachmentSchema = z.object({
  kind: z.enum(["document", "image"]),
  id: z.string().uuid(),
  name: z.string().min(1).max(300),
  /** An image's thumbnail; null for a document. */
  url: z.string().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const statusLineSchema = z.object({ text: z.string(), state: z.enum(["running", "done", "failed"]) });
export type StatusLine = z.infer<typeof statusLineSchema>;

/** The structured part of an assistant message. Later parts add the gate card and the change card. */
export const threadCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status"), lines: z.array(statusLineSchema) }),
]);
export type ThreadCard = z.infer<typeof threadCardSchema>;

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  card: ThreadCard | null;
  attachments: Attachment[];
  suggestions: string[];
  createdAt: string;
};

/** Which saved thread of a client. Only the onboarding thread lives in this store (D496). */
export type CopilotThread = "onboarding";

/** What the panel shows: the saved messages, what is running right now, and the reply choices. */
export type ThreadState = { messages: ThreadMessage[]; live: StatusLine[]; suggestions: string[] };
