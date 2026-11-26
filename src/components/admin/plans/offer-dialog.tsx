"use client";

import { useState, type ReactElement } from "react";
import { Clock, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveOfferAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings, CatalogPrice, CatalogProduct } from "@/lib/billing/catalog";
import { CreditsField } from "@/lib/billing/admin-schema";
import { RupeesField } from "@/lib/billing/catalog-schema";
import { withGst } from "@/lib/billing/gst";
import { PLAN_INTERVALS, formatRupees, realMarginPct } from "@/lib/billing/pricing";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";
import { OfferMarginCheck } from "./offer-margin-check";

const plain = (n: number) => n.toLocaleString("en-IN");
const NOUN = { plan: "plan", topup: "top-up pack" } as const;

/** Who pays a new price, as the save and the move really work (D593): agencies on the plan move to
 *  it at their next renewal, except a plan paid by UPI or bank mandate, which can't be changed. */
function NewPriceNote({ plan, name, agencies, amountMinor }: { plan: boolean; name: string; agencies: number; amountMinor: number }) {
  const price = formatRupees(withGst(amountMinor));
  const text = !plan
    ? `Agencies pay ${price} from their next top-up.`
    : agencies === 0
      ? `No agency is on ${name}, so no one pays a different amount.`
      : `${agencies === 1 ? "The agency on it moves" : `The ${plain(agencies)} agencies on it move`} to ${price} a month at ${agencies === 1 ? "its" : "their"} next renewal, and the owners get an email. A plan paid by UPI or bank mandate can't be changed: it stays on its price until it changes plan, and shows in Needs a look.`;
  const Icon = plan && agencies > 0 ? Clock : Info;
  return (
    <p className="flex gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <Icon aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>
        <span className="font-medium">This is a new price.</span> {text}
      </span>
    </p>
  );
}

// Add a plan or pack, or edit it, in one step: name, description, credits and price together
// (spec "One step", D579). The margin check follows what is typed; a reason is asked only when an
// edit changes the price.
export function OfferDialog({
  kind,
  product,
  price,
  agencies = 0,
  settings,
  trigger,
}: {
  kind: "plan" | "topup";
  product?: CatalogProduct;
  price?: CatalogPrice | null;
  /** Plans on the offer that move to a new price: active or payment due, not ending. */
  agencies?: number;
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

  const plan = kind === "plan";
  const interval = plan ? PLAN_INTERVALS[0] : null;
  const credits = CreditsField.safeParse(form.credits);
  const amount = RupeesField.safeParse(form.amount);
  const margin =
    settings && credits.success && amount.success
      ? realMarginPct({ amount_minor: amount.data, credits: credits.data, interval_months: interval, credits_every_months: interval ? 1 : null }, settings.inrPerUsd)
      : null;
  const priceChanged = !!product && !!price && credits.success && amount.success && (credits.data !== price.credits || amount.data !== price.amount_minor);

  return (
    <BillingChangeDialog
      trigger={trigger}
      title={product ? `Edit ${product.name}` : `Add a ${NOUN[kind]}`}
      description={plan ? "Paid monthly. Credits arrive every month." : "Paid once. The credits last until the plan month ends."}
      saveLabel={product ? (priceChanged ? "Save the new price" : "Save") : `Add ${NOUN[kind]}`}
      askReason={priceChanged}
      onOpen={() => setForm(start)}
      onSubmit={(reason) =>
        saveOfferAction({ productId: product?.id ?? null, kind, name: form.name, description: form.description, active: product?.active ?? true, amount: form.amount, credits: form.credits, reason })
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offer-name">Name</Label>
        <Input id="offer-name" value={form.name} onChange={set("name")} placeholder={plan ? "For example, Studio" : "For example, Small top-up"} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offer-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="offer-description" value={form.description} onChange={set("description")} rows={2} placeholder="What it is for, shown to owners" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-credits">{plan ? "Credits each month" : "Credits"}</Label>
          <Input id="offer-credits" inputMode="numeric" value={form.credits} onChange={set("credits")} placeholder="10,00,000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-amount">Price before GST</Label>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>₹</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput id="offer-amount" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="1,20,000" />
            {plan && (
              <InputGroupAddon align="inline-end">
                <InputGroupText>a month</InputGroupText>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
      </div>
      <OfferMarginCheck
        plan={plan}
        credits={credits.success ? credits.data : null}
        amountMinor={amount.success ? amount.data : null}
        margin={margin}
        settings={settings}
        onSuggest={(minor) => setForm((f) => ({ ...f, amount: plain(minor / 100) }))}
      />
      {priceChanged && amount.success && product && <NewPriceNote plan={plan} name={product.name} agencies={agencies} amountMinor={amount.data} />}
    </BillingChangeDialog>
  );
}
