import { Button } from "@/components/ui/button";
import type { Angle } from "@/lib/scripts/copilot/schema";

/** Spec 2 §5 piece 4 — three proposed angles, each with what it commits to (interaction model §3.3).
 *  Picking one sends the pick as the person's message; blending or writing one is typed. */
export function CopilotAnglesCard({ angles, disabled, onPick }: { angles: Angle[]; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <ol className="flex w-full flex-col gap-2">
      {angles.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="font-display text-base font-medium text-primary">{a.id}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">{a.hook}</span>
              <span className="text-muted-foreground">{a.situation}</span>
            </div>
          </div>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-xs">
            {[["Meal and use", a.mealMoment], ["Who else", a.supportingCast], ["Review theme", a.reviewTheme], ["Proof", a.proofEmphasis]]
              .filter(([, v]) => v.trim())
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          <Button variant="outline" size="xs" className="self-start" disabled={disabled} onClick={() => onPick(a.id)}>
            Go with {a.id}
          </Button>
        </li>
      ))}
    </ol>
  );
}
