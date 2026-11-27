import { Card } from "@/components/ui/card";
import type { OpenGrant } from "@/lib/billing/grants";
import { CreditGrantList } from "@/components/billing/credit-grant-list";

// The agency's open credits in the Usage page's side column (D582, D597), the ones ending first at
// the top, as they are used.
export function CreditsCard({ grants, left }: { grants: OpenGrant[]; left: number }) {
  return (
    <Card className="gap-2 p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">Credits</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{left.toLocaleString("en-IN")} left</span>
      </div>
      <CreditGrantList grants={grants} empty="No credits right now. AI runs start again when you pick a plan or top up." />
    </Card>
  );
}
