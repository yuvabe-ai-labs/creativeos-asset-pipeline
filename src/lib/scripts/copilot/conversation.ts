import type { MessageCard, ScriptMessage } from "./schema";

// The conversation the copilot reads with each message: the last 10, whole, oldest first, so it
// stays coherent ("go with B, but warmer", "like before") (user, 28 Oct 2026; nothing is cut "for
// now, the context window is big"). The script and brief still outrank it (the shared rules say so).

export const CONVERSATION_WINDOW = 10;

/** What a card showed, in a line: a card has no text of its own, but people point back to it. */
function cardLine(card: MessageCard): string {
  switch (card.kind) {
    case "angles":
      return `[showed angles: ${card.angles.map((a) => `${a.id}. ${a.hook}: ${a.situation}`).join("; ")}]`;
    case "research":
      return `[showed the market signals the angles drew on: ${card.signals.map((s) => s.name).join(", ") || "none"}]`;
    case "confirmation":
      return `[showed the brief card "${card.card.title}"${card.card.beats.length ? `, beats ${card.card.beats.join(" › ")}` : ""}]`;
    case "proposal":
      return `[proposed a change to ${card.before.length} shots: ${card.status}]`;
    case "import":
      return `[offered to replace the draft with a pasted script (${card.summary}): ${card.status}]`;
  }
}

/** The last `limit` messages before the one being answered, one per line, labelled by who said them. */
export function renderConversation(history: readonly ScriptMessage[], limit = CONVERSATION_WINDOW): string {
  return history
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "Person" : "Copilot"}: ${[m.content.trim(), m.card ? cardLine(m.card) : ""].filter(Boolean).join(" ")}`)
    .join("\n");
}
