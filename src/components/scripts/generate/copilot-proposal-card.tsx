import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProposalCard } from "@/lib/scripts/copilot/schema";
import type { Shot } from "@/lib/scripts/schema";

const STATUS: Record<Exclude<ProposalCard["status"], "pending">, string> = {
  accepted: "Applied", rejected: "Not applied", stale: "Out of date, not applied",
};

function ShotLines({ shots }: { shots: Shot[] }) {
  if (shots.length === 0) return <p className="text-muted-foreground">(none)</p>;
  return (
    <ul className="flex flex-col gap-2">
      {shots.map((s) => (
        <li key={s.id} className="flex flex-col gap-0.5">
          <span className="text-eyebrow">{s.beat || "No beat"} · {s.lengthSeconds}s</span>
          <span>{s.visual}</span>
          {s.vo && <span className="text-muted-foreground">VO: {s.vo}</span>}
          {s.onScreenText && <span className="font-medium">{s.onScreenText}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Spec 2 §9 — "A chat edit that touches several shots is shown as a before-and-after to accept or reject." */
export function CopilotProposalCard({ card, disabled, onResolve }: {
  card: ProposalCard;
  disabled: boolean;
  onResolve: (decision: "accept" | "reject") => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1"><span className="text-eyebrow">Before</span><ShotLines shots={card.before} /></div>
        <div className="flex flex-col gap-1"><span className="text-eyebrow">After</span><ShotLines shots={card.after} /></div>
      </div>
      {card.status === "pending" ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => onResolve("accept")}>Accept</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("reject")}>Reject</Button>
        </div>
      ) : (
        <Badge variant="outline" className="self-start">{STATUS[card.status]}</Badge>
      )}
    </div>
  );
}
