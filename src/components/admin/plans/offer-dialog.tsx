"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveOfferAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings, CatalogPrice, CatalogProduct } from "@/lib/billing/catalog";
import { CreditsField } from "@/lib/billing/admin-schema";
import { RupeesField } from "@/lib/billing/catalog-schema";
import { GST_PCT, PLAN_INTERVALS, formatRupees, realMarginPct, suggestAmountMinor } from "@/lib/billing/pricing";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";

const plain = (n: number) => n.toLocaleString("en-IN");
const NOUN = { plan: "plan", topup: "top-up pack" } as const;

// Add a plan or pack, or edit it, in one step: name, description, credits and price together
// (spec "One step"). The margin and the price with GST follow what is typed; a reason is asked
// only when an edit changes the price.
export function OfferDialog({
  kind,
  product,
  price,
  subscribers = 0,
  settings,
  trigger,
}: {
  kind: "plan" | "topup";
  product?: CatalogProduct;
  price?: CatalogPrice | null;
  subscribers?: number;
  settings: BillingSettings | null;
  trigger: ReactElement;
}) {
  const start = {
    name: product?.name ?? "",
    description: product?.description ?? "",
    credits: price ? plain(price.credits) : "",
    amount: price ? plain(price.amount_minor / 100) : "",
  };
  const [form, setForm] = useState(start);
  const set = (key: keyof typeof start) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const interval = kind === "plan" ? PLAN_INTERVALS[0] : null;
  const credits = CreditsField.safeParse(form.credits);
  const amount = RupeesField.safeParse(form.amount);
  const defaultMargin = kind === "plan" ? settings?.planMarginPct : settings?.topupMarginPct;
  const margin =
    settings && credits.success && amount.success
      ? realMarginPct({ amount_minor: amount.data, credits: credits.data, interval_months: interval, credits_every_months: interval ? 1 : null }, settings.inrPerUsd)
      : null;
  const low = margin !== null && settings !== null && margin < settings.minMarginPct;
  const priceChanged = !!product && !!price && credits.success && amount.success && (credits.data !== price.credits || amount.data !== price.amount_minor);

  function suggest() {
    if (!settings || !credits.success || defaultMargin === undefined) return;
    setForm((f) => ({ ...f, amount: plain(suggestAmountMinor(credits.data, settings.inrPerUsd, defaultMargin) / 100) }));
  }

  return (
    <BillingChangeDialog
      trigger={trigger}
      title={product ? `Edit ${product.name}` : `Add a ${NOUN[kind]}`}
      description={
        priceChanged
          ? `This is a new price. ${subscribers === 1 ? "1 agency moves" : `${subscribers} agencies move`} to it from their next payment.`
          : kind === "plan" ? "Paid monthly. Credits arrive every month." : "Paid once. The credits last until the plan month ends."
      }
      saveLabel={product ? "Save" : `Add ${NOUN[kind]}`}
      askReason={priceChanged}
      onOpen={() => setForm(start)}
      onSubmit={(reason) =>
        saveOfferAction({ productId: product?.id ?? null, kind, name: form.name, description: form.description, active: product?.active ?? true, amount: form.amount, credits: form.credits, reason })
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offer-name">Name</Label>
        <Input id="offer-name" value={form.name} onChange={set("name")} placeholder={kind === "plan" ? "e.g. Studio" : "e.g. Small top-up"} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offer-description">Description <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea id="offer-description" value={form.description} onChange={set("description")} rows={2} placeholder="What it is for, shown to owners" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-credits">{kind === "plan" ? "Credits each month" : "Credits"}</Label>
          <Input id="offer-credits" inputMode="numeric" value={form.credits} onChange={set("credits")} placeholder="e.g. 1,00,000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-amount">Price in ₹, before GST</Label>
          <Input id="offer-amount" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="e.g. 12,000" />
        </div>
      </div>
      <div className="-mt-1 flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className={low ? "text-destructive" : "text-muted-foreground"}>
          {margin === null ? "Enter credits and a price to see the margin." : `Margin ${margin}%${low ? `, below ${settings?.minMarginPct}%` : ""}`}
          {amount.success && <> · {formatRupees(Math.round(amount.data * (1 + GST_PCT / 100)))} with GST</>}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={suggest} disabled={!settings || !credits.success}>
          {defaultMargin === undefined ? "Suggest price" : `Suggest at ${defaultMargin}%`}
        </Button>
      </div>
    </BillingChangeDialog>
  );
}
