import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The next approval (journey spec §4.3): what it is, what it opens, and why the copilot cannot do
 *  it for the person. The same in every stage; the stage says what approving does. */
export function ThreadGateCard({ title, opens, why, busy, onApprove }: {
  title: string;
  opens: string;
  why: string;
  busy: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-base font-medium">{title}</h3>
        <p className="text-sm">{opens}</p>
        <p className="text-sm text-muted-foreground">{why}</p>
      </div>
      <Button size="sm" className="self-start" disabled={busy} onClick={onApprove}>
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden />}
        {title}
      </Button>
    </div>
  );
}
