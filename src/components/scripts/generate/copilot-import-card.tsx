import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImportCard } from "@/lib/scripts/copilot/schema";

const STATUS: Record<Exclude<ImportCard["status"], "pending">, string> = {
  accepted: "Replaced the draft", rejected: "Kept the current draft",
};

/** Paste-a-script spec §3 — a whole script pasted over a draft. Nothing changes until the person
 *  picks; the card says what the paste holds and what it would replace (§8 Q1). */
export function CopilotImportCard({ card, disabled, onResolve }: {
  card: ImportCard;
  disabled: boolean;
  onResolve: (decision: "accept" | "reject") => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="text-eyebrow">Pasted script</span>
        <span className="font-medium">{card.doc.header.title}</span>
        <span className="text-muted-foreground">{`${card.summary}, replacing ${card.replacing}`}</span>
      </div>
      {card.status === "pending" ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => onResolve("accept")}>Replace the draft</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("reject")}>Keep the current one</Button>
        </div>
      ) : (
        <Badge variant="outline" className="self-start">{STATUS[card.status]}</Badge>
      )}
    </div>
  );
}
