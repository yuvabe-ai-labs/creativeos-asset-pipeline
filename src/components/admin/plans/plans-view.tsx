"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NeedsALookCard } from "@/components/admin/models/needs-a-look-card";
import type { BillingSettings, PriceHealth } from "@/lib/billing/catalog";
import { lowMarginItems, moveRefusedItems, type OfferView } from "@/lib/admin/plans-page";
import { OfferDialog } from "./offer-dialog";
import { OffersSection } from "./offers-section";

type Show = "all" | "agency";
const SHOWS: Record<Show, string> = { all: "Everything", agency: "What agencies see" };

// Admin › Plans and prices, cards with health (D592): Needs a look for offers under the minimum and
// agencies that can't move to a new price (D593), then plans and top-up packs. "Show: What agencies see" turns it into the owner's page, the same
// switch as on Models.
export function PlansView({ views, health, settings }: { views: OfferView[]; health: Record<string, PriceHealth>; settings: BillingSettings | null }) {
  const [show, setShow] = useState<Show>("all");
  const byId = useMemo(() => new Map(views.map((v) => [v.product.id, v])), [views]);
  const agency = show === "agency";
  const plans = views.filter((v) => v.plan);
  const packs = views.filter((v) => !v.plan);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Select value={show} onValueChange={(v) => v && setShow(v as Show)}>
          <SelectTrigger className="h-10 bg-card" aria-label="Show">
            <SelectValue>
              <span className="text-muted-foreground">Show:</span> {SHOWS[show]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SHOWS) as Show[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SHOWS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {agency && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
            The plans page an owner with no plan gets: shown offers only, no costs, margins or counts.
          </p>
        )}
      </div>
      {!agency && (
        <div className="mt-5">
          <NeedsALookCard
            items={[...lowMarginItems(views, settings), ...moveRefusedItems(views)]}
            renderAction={(item) => {
              if (!item.key.startsWith("low-")) {
                return (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={item.href} prefetch={false} />}>
                    {item.action}
                  </Button>
                );
              }
              const v = byId.get(item.key.replace(/^low-/, ""));
              if (!v) return null;
              return (
                <OfferDialog
                  kind={v.product.kind}
                  product={v.product}
                  price={v.price}
                  agencies={v.agencies - v.ending}
                  settings={settings}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Pencil aria-hidden strokeWidth={1.5} />
                      {item.action}
                    </Button>
                  }
                />
              );
            }}
          />
        </div>
      )}
      <OffersSection kind="plan" views={plans} health={health} settings={settings} agency={agency} />
      <OffersSection kind="topup" views={packs} health={health} settings={settings} agency={agency} />
    </div>
  );
}
