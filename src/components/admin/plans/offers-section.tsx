"use client";

import { AddChip } from "@/components/admin/models/add-chip";
import type { BillingSettings, PriceHealth } from "@/lib/billing/catalog";
import { sectionSummary, sortOffers, type OfferView } from "@/lib/admin/plans-page";
import { AgencyOfferCard } from "./agency-offer-card";
import { OfferCard } from "./offer-card";
import { OfferDialog } from "./offer-dialog";

const COPY = {
  plan: { title: "Plans", hint: "Paid monthly. Credits arrive every month.", add: "Add a plan", none: "No plans yet." },
  topup: { title: "Top-up packs", hint: "For agencies on a plan. The credits last until the plan month ends.", add: "Add a top-up pack", none: "No top-up packs yet." },
} as const;

// Plans or packs as cards (D592): a heading with what they bring in and Add, then one card each,
// hidden ones last. "What agencies see" shows only what owners can buy, as they see it.
export function OffersSection({
  kind,
  views,
  health,
  settings,
  agency = false,
}: {
  kind: "plan" | "topup";
  views: OfferView[];
  health: Record<string, PriceHealth>;
  settings: BillingSettings | null;
  agency?: boolean;
}) {
  const copy = COPY[kind];
  const shown = agency ? views.filter((v) => v.product.active && v.price) : sortOffers(views);
  return (
    <section aria-labelledby={`offers-${kind}`} className="mt-7">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 id={`offers-${kind}`} className="font-display text-lg font-semibold tracking-tight">
          {copy.title}
        </h2>
        <p className="text-xs text-muted-foreground">{agency ? copy.hint : sectionSummary(views, kind)}</p>
        <span className="flex-1" />
        {!agency && <OfferDialog kind={kind} settings={settings} trigger={<AddChip label={copy.add} />} />}
      </div>
      {shown.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {shown.map((v) => (agency ? <AgencyOfferCard key={v.product.id} view={v} /> : <OfferCard key={v.product.id} view={v} health={health} settings={settings} />))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.none}</p>
      )}
    </section>
  );
}
