import type { NewCopilotMessage } from "@/lib/db/copilot-messages";

// The record of who approved a stage or a card (journey map §2), the same for every stage. The name
// is kept as it was that day: an approval is an event, and the thread is read too often to look
// names up each time.

export function approvalMessage(input: { what: string; by: string; byId: string | null; opens?: string }): NewCopilotMessage {
  return {
    role: "assistant",
    content: [`${input.by} approved ${input.what}.`, ...(input.opens ? [input.opens] : [])].join(" "),
    suggestions: [],
    card: { kind: "approval", what: input.what, by: input.by, byId: input.byId },
  };
}
