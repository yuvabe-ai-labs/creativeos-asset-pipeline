import { Card } from "@/components/ui/card";

// How a managed agency's credits work (D597), in the Usage page's side column where a paying
// agency has its plan and payments. The numbers are the tiles at the top.
export function ManagedCreditsCard({ limit }: { limit: number | null }) {
  return (
    <Card className="gap-1.5 p-5 shadow-card">
      <h2 className="font-display text-base font-semibold tracking-tight">Your credits</h2>
      <p className="text-sm text-muted-foreground">
        {limit === null
          ? "Yuvabe looks after your credits. There's no monthly limit and nothing to pay here."
          : `Yuvabe looks after your credits. You have ${Math.round(limit).toLocaleString("en-IN")} a month, starting again on the 1st. Nothing to pay here; ask Yuvabe to change the limit.`}
      </p>
    </Card>
  );
}
