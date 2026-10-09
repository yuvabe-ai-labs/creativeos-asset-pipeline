import { Search } from "lucide-react";
import type { MessageCard } from "@/lib/scripts/copilot/schema";

type Research = Extract<MessageCard, { kind: "research" }>;

/** The angles that drew on a signal; an angle that used none has no row. */
export function researchRows(card: Research) {
  return card.perAngle.filter((a) => a.signalIds.length > 0);
}

/** Spec 2 §6 — "The result appears as a card in the conversation, naming which signals each angle
 *  actually used." The signals only: the angle card below says what each angle is. */
export function CopilotResearchCard({ card }: { card: Research }) {
  const names = new Map(card.signals.map((s) => [s.id, s.name]));
  return (
    <div className="w-full rounded-xl border border-border bg-background p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <span className="text-eyebrow">Market Research</span>
        <span className="ml-auto text-xs text-muted-foreground">{card.signals.length} signal{card.signals.length === 1 ? "" : "s"} read</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {researchRows(card).map((a) => (
          <li key={a.angleId} className="flex gap-2">
            <span className="w-3 shrink-0 font-medium text-primary">{a.angleId}</span>
            <span>{a.signalIds.map((id) => names.get(id) ?? id).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
