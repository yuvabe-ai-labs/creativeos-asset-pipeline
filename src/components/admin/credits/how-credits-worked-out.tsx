import type { Settings } from "@/lib/admin/credits-page";
import { WorkedExample } from "./worked-example";

/** "How credits are worked out", open in place on the card: the sum in words and worked at the live settings. */
export function HowCreditsWorkedOut({ settings }: { settings: Settings }) {
  return (
    <div className="flex flex-col gap-3 text-[0.8125rem]">
      <p>
        We take what the run costs us, count 1 credit for every $0.001, add the margin, then round up. The estimate before a run and the
        charge after it use the same sum.
      </p>
      <WorkedExample settings={settings} />
      <p className="text-xs text-muted-foreground">
        A run uses the settings live when it started, so a change never touches runs already made or still running. The credit rate changes
        only with plan prices, since it sets what the credits agencies hold are worth.
      </p>
    </div>
  );
}
