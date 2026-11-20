"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPriceAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings, CatalogPrice, CatalogProduct } from "@/lib/billing/catalog";
import { CreditsField } from "@/lib/billing/admin-schema";
import { RupeesField } from "@/lib/billing/catalog-schema";
import { GST_PCT, PLAN_INTERVALS, formatRupees, intervalLabel, realMarginPct, suggestAmountMinor } from "@/lib/billing/pricing";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";

const plain = (n: number) => n.toLocaleString("en-IN");

// Add a price to a plan or pack, or a new price replacing one (spec §2). The amount can be
// filled from the suggested price; the margin is shown as it is typed.
export function PriceDialog({
  product,
  replaces,
  subscribers = 0,
  settings,
  trigger,
}: {
  product: CatalogProduct;
  replaces?: CatalogPrice;
  subscribers?: number;
  settings: BillingSettings | null;
  trigger: ReactElement;
}) {
  const interval = product.kind === "plan" ? PLAN_INTERVALS[0] : null;
  const initialCredits = replaces ? plain(replaces.credits) : "";
  const initialAmount = replaces ? plain(replaces.amount_minor / 100) : "";
  const [credits, setCredits] = useState(initialCredits);
  const [amount, setAmount] = useState(initialAmount);

  const parsedCredits = CreditsField.safeParse(credits);
  const parsedAmount = RupeesField.safeParse(amount);
  const marginPct = product.kind === "plan" ? settings?.planMarginPct : settings?.topupMarginPct;
  const margin =
    settings && parsedCredits.success && parsedAmount.success
      ? realMarginPct({ amount_minor: parsedAmount.data, credits: parsedCredits.data, interval_months: interval, credits_every_months: interval ? 1 : null }, settings.inrPerUsd)
      : null;
  const low = margin !== null && settings !== null && margin < settings.minMarginPct;

  function suggest() {
    if (!settings || !parsedCredits.success || marginPct === undefined) return;
    setAmount(plain(suggestAmountMinor(parsedCredits.data, settings.inrPerUsd, marginPct) / 100));
  }

  return (
    <BillingChangeDialog
      trigger={trigger}
      title={replaces ? `New price for ${product.name}` : `Add a price to ${product.name}`}
      description={
        replaces
          ? `The current price is hidden. ${subscribers === 1 ? "1 agency moves" : `${subscribers} agencies move`} to the new price from their next payment.`
          : product.kind === "plan" ? `${intervalLabel(PLAN_INTERVALS[0])}. Credits arrive every month.` : "Paid once. Lasts until the plan month ends."
      }
      saveLabel={replaces ? "Save new price" : "Add price"}
      onOpen={() => { setCredits(initialCredits); setAmount(initialAmount); }}
      onSubmit={(reason) =>
        addPriceAction({ productId: product.id, kind: product.kind, amount, credits, intervalMonths: interval, replaces: replaces?.id ?? null, reason })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price-credits">{product.kind === "plan" ? "Credits each month" : "Credits"}</Label>
          <Input id="price-credits" inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 1,00,000" autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price-amount">Price in ₹, before GST</Label>
          <Input id="price-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 12,000" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={low ? "text-destructive" : "text-muted-foreground"}>
          {margin === null ? "Enter credits and a price to see the margin." : `Margin ${margin}%${low ? `, below the ${settings?.minMarginPct}% minimum` : ""}`}
          {parsedAmount.success && <> · {formatRupees(Math.round(parsedAmount.data * (1 + GST_PCT / 100)))} with GST</>}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={suggest} disabled={!settings || !parsedCredits.success}>
          {marginPct === undefined ? "Suggest a price" : `Suggest at ${marginPct}%`}
        </Button>
      </div>
    </BillingChangeDialog>
  );
}
