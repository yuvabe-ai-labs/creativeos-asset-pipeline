import { GST_PCT, formatRupees } from "@/lib/billing/pricing";

// How a plan or top-up pack looks to an owner: the same face in Admin › Plans and prices (with
// Admin's footer under it) and on the owner's plans and billing pages (D520, D523).
export function PlanCardFace({
  name,
  amountMinor,
  credits,
  monthly,
  description,
  badge,
}: {
  name: string;
  amountMinor: number | null;
  credits: number | null;
  monthly: boolean;
  description?: string | null;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-lg font-semibold tracking-tight">{name}</span>
        {badge}
      </div>
      {amountMinor !== null ? (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-baseline gap-1">
            <span className="font-display text-2xl font-semibold tracking-tight">{formatRupees(amountMinor)}</span>
            <span className="text-sm text-muted-foreground">{monthly ? "/ month" : "once"}</span>
          </span>
          <span className="text-xs text-muted-foreground">+ GST · {formatRupees(Math.round(amountMinor * (1 + GST_PCT / 100)))} in all</span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">No price yet, so owners can&apos;t buy it.</span>
      )}
      {credits !== null && (
        <span className="text-sm">
          {credits.toLocaleString("en-IN")} credits {monthly ? "every month" : "until the plan month ends"}
        </span>
      )}
      {description && <span className="text-sm text-muted-foreground">{description}</span>}
    </div>
  );
}
