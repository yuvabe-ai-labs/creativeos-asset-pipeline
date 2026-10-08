import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConfirmationCard } from "@/lib/scripts/copilot/schema";
import { reelLabel } from "@/lib/scripts/utils";

/** Spec 2 §5 — "Every path ends on the confirmation card: one short card listing each piece, marked
 *  given or proposed, plus the cast … and the items to confirm. The person writes, or changes a line." */
export function CopilotConfirmationCard({ card, disabled, onWrite }: { card: ConfirmationCard; disabled: boolean; onWrite: () => void }) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{reelLabel(card.reelNumber)}</span>
        <span className="font-display text-base font-medium">{card.title}</span>
      </div>
      <dl className="flex flex-col gap-1.5">
        {card.lines.map((l) => (
          <div key={l.label} className="grid grid-cols-[8rem_1fr_auto] items-start gap-2">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd>{l.value}</dd>
            <Badge variant="outline" className="text-[0.7rem]">{l.source}</Badge>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <span className="text-eyebrow">Cast</span>
        <ul className="flex flex-col gap-0.5">
          {card.cast.map((c) => (
            <li key={c.name}><span className="font-medium">{c.name}</span>{c.isLead && " (lead)"}<span className="text-muted-foreground"> · {c.role}</span></li>
          ))}
        </ul>
      </div>
      {card.toConfirm.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-eyebrow">To confirm before Final</span>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">{card.toConfirm.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      <Button size="sm" className="self-start" disabled={disabled} onClick={onWrite}>Write it</Button>
    </div>
  );
}
