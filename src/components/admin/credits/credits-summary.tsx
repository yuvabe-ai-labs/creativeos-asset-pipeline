import { CalendarDays, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** The settings in one line, the next change (or none), "How is this worked out?" and the page's one action. */
export function CreditsSummary({
  line,
  next,
  onHow,
  onStart,
}: {
  line: string;
  next: { when: string; utc: string; text: string } | null;
  onHow: () => void;
  /** Hidden while the change flow is open. */
  onStart: (() => void) | null;
}) {
  return (
    <section aria-label="Current settings" className="mb-6 flex flex-col items-start gap-4 rounded-2xl border bg-card px-5 py-4 shadow-card md:flex-row md:items-center md:px-[22px]">
      <div className="flex-1">
        <p className="font-display text-lg font-semibold tracking-tight">{line}</p>
        <p className="mt-1.5 text-[0.8125rem]">
          {next ? (
            <>
              <Badge variant="outline" className="mr-1.5 border-primary/30 bg-primary/5 font-medium text-primary">
                <CalendarDays aria-hidden strokeWidth={1.5} />
                Next
              </Badge>
              From {next.when} <span className="text-muted-foreground">({next.utc})</span>: {next.text}{" "}
            </>
          ) : (
            <span className="text-muted-foreground">No change scheduled. </span>
          )}
          <Button id="credits-how" variant="link" size="xs" className="h-auto px-0 text-[0.8125rem]" onClick={onHow}>
            How is this worked out?
          </Button>
        </p>
      </div>
      {onStart && (
        <Button id="credits-change-start" onClick={onStart}>
          <Pencil aria-hidden strokeWidth={1.5} />
          Change credit settings
        </Button>
      )}
    </section>
  );
}
