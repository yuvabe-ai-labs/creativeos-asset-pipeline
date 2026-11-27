"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgencyTag } from "@/components/admin/agencies/agency-tag";
import type { BillingSettings } from "@/lib/billing/catalog";
import { withGst } from "@/lib/billing/gst";
import { GST_PCT, costMinor, formatRupees, suggestAmountMinor } from "@/lib/billing/pricing";

const plain = (n: number) => n.toLocaleString("en-IN");

function Line({ label, children, total = false }: { label: string; children: React.ReactNode; total?: boolean }) {
  return (
    <div className={total ? "flex items-baseline justify-between gap-3 border-t border-border/60 pt-1.5" : "flex items-baseline justify-between gap-3"}>
      <span className={total ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

/**
 * The margin check under the price (spec "One step"): what an agency pays with GST, what the credits
 * cost us, the margin, and a price at the default margin. A warning under the minimum.
 */
export function OfferMarginCheck({
  plan,
  credits,
  amountMinor,
  margin,
  settings,
  onSuggest,
}: {
  plan: boolean;
  credits: number | null;
  amountMinor: number | null;
  margin: number | null;
  settings: BillingSettings | null;
  onSuggest: (amountMinor: number) => void;
}) {
  const defaultMargin = settings ? (plan ? settings.planMarginPct : settings.topupMarginPct) : null;
  const low = margin !== null && settings !== null && margin < settings.minMarginPct;
  const suggested = settings && credits !== null && defaultMargin !== null ? suggestAmountMinor(credits, settings.inrPerUsd, defaultMargin) : null;

  return (
    <>
      <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm" aria-live="polite">
        {margin === null || amountMinor === null || credits === null || !settings ? (
          <span className="text-muted-foreground">Type the credits and a price to check the margin.</span>
        ) : (
          <>
            <Line label="An agency pays">
              <span className="font-semibold">{formatRupees(withGst(amountMinor))}</span>{" "}
              <span className="text-xs text-muted-foreground">
                {formatRupees(amountMinor)} + {GST_PCT}% GST{plan ? ", every month" : ""}
              </span>
            </Line>
            <Line label="The credits cost us">
              {formatRupees(Math.round(costMinor(credits, settings.inrPerUsd)))}{" "}
              <span className="text-xs text-muted-foreground">
                {plain(credits)} credits at ₹{plain(settings.inrPerUsd)} a dollar
              </span>
            </Line>
            <Line label="Margin" total>
              {low ? (
                <AgencyTag tone="warn">
                  <TriangleAlert aria-hidden strokeWidth={1.5} className="size-3.5" />
                  {margin}%, below {settings.minMarginPct}%
                </AgencyTag>
              ) : (
                <span className="font-semibold">{margin}%</span>
              )}
            </Line>
          </>
        )}
        {defaultMargin !== null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {suggested !== null ? `At ${defaultMargin}% the price would be ${formatRupees(suggested)}.` : `Type the credits to get a price at ${defaultMargin}%.`}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={suggested === null} onClick={() => suggested !== null && onSuggest(suggested)}>
              Use {defaultMargin}%
            </Button>
          </div>
        )}
      </div>
      {low && settings && (
        <p className="flex gap-2 rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-sm text-warning-text">
          <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" />
          This price earns less than {settings.minMarginPct}% at ₹{plain(settings.inrPerUsd)} a dollar. A small rise in the dollar could make it lose money.
        </p>
      )}
    </>
  );
}
