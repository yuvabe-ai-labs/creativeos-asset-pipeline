import { Search } from "lucide-react";
import type { MessageCard } from "@/lib/scripts/copilot/schema";

type Research = Extract<MessageCard, { kind: "research" }>;

/** Spec 2 §6 — "The result appears as a card in the conversation, naming which signals each angle
 *  actually used." */
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
        {card.perAngle.map((a) => (
          <li key={a.angleId}>
            <span className="font-medium">{a.angleId}</span>
            <span className="text-muted-foreground"> · </span>
            {a.signalIds.length > 0 ? a.signalIds.map((id) => names.get(id) ?? id).join(", ") : <span className="text-muted-foreground">no signal used</span>}
            {a.note && <span className="text-muted-foreground"> · {a.note}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Signals shape where and when only. Claims and proof come from the brand KB.</p>
    </div>
  );
}
