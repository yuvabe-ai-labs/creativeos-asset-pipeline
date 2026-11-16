import type { ThreadMessage } from "@/lib/journey/thread/schema";

// The review walk (brand KB spec §2.3): the copilot asks about the few fields it could not settle,
// one at a time. Code decides which field is asked, how the question is worded and when the walk
// stops; the model only reads the person's answer. Pure, and read back from the thread itself: no
// separate state is kept.

export type Walk = {
  /** The fields asked about since the last build, each once. */
  asked: string[];
  /** The field of the question that is still the last thing said; null when none is. */
  pending: string | null;
};

/** A build's own message carries a status card: a new build starts the walk again. A note (a save
 *  on the page) is looked past: it neither answers a question nor resets anything. */
export function walkOf(messages: ThreadMessage[]): Walk {
  let asked: string[] = [];
  let last: ThreadMessage | null = null;
  for (const m of messages) {
    if (m.card?.kind === "note") continue;
    last = m;
    if (m.role !== "assistant") continue;
    if (m.card?.kind === "status") asked = [];
    else if (m.card?.kind === "question" && !asked.includes(m.card.field)) asked.push(m.card.field);
  }
  const pending = last && last.role === "assistant" && last.card?.kind === "question" ? last.card.field : null;
  return { asked, pending };
}
