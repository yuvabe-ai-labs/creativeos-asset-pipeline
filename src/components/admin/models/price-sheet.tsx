"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { formatIstDate } from "@/lib/admin/ist";
import { noPriceText, sheetFootnote, sheetTitle } from "@/lib/admin/price-sheet";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { AddPricesChip } from "@/components/admin/models/change-prices-button";
import { PriceGridView } from "@/components/admin/models/price-grid-view";
import { TryARun } from "@/components/admin/models/try-a-run";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SheetModel = Pick<AiModel, "id" | "kind" | "label" | "params" | "providerLabel">;

/**
 * The price sheet: every price at its stored precision in the model's own settings, credits at the
 * live settings, other charges, one footnote when it applies, and Try a run. With a change
 * scheduled, "Live now" and "From <date>" flip between the two.
 */
export function PriceSheet({
  model,
  current,
  next,
  settings,
  onAddPrices,
}: {
  model: SheetModel;
  current: AiModelPrice | null;
  next: AiModelPrice | null;
  settings: Pick<CreditSettings, "marginPercent" | "roundStep">;
  onAddPrices?: () => void;
}) {
  const [view, setView] = useState<"now" | "next">("now");
  const shown = view === "next" && next ? next : (current ?? next);
  const compare = shown && shown === next && current ? current : null;
  const footnote = sheetFootnote(model, shown, settings);

  return (
    <section aria-labelledby="sheet-title" className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="flex flex-wrap items-start gap-3 px-5 pt-5 pb-3.5 md:px-[22px]">
        <h2 id="sheet-title" className="flex-1 font-display text-lg font-semibold tracking-tight">
          {sheetTitle(model.kind)}
        </h2>
        {current && next && (
          <Tabs value={view} onValueChange={(v) => setView(v === "next" ? "next" : "now")}>
            <TabsList aria-label="Which prices">
              <TabsTrigger value="now">Live now</TabsTrigger>
              <TabsTrigger value="next">From {formatIstDate(new Date(next.effectiveFrom), false)}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {shown ? (
        <>
          <div className="px-5 pb-5 md:px-[22px]">
            <PriceGridView model={model} price={shown} compare={compare} settings={settings} />
          </div>
          {footnote && <p className="px-5 pb-4 text-xs text-muted-foreground md:px-[22px]">{footnote}</p>}
          <TryARun model={model} price={shown} compare={compare} settings={settings} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-12 text-center">
          <Wallet aria-hidden strokeWidth={1.5} className="size-6 text-muted-foreground" />
          <h3 className="text-sm font-semibold">No price yet</h3>
          <p className="max-w-md text-[0.8125rem] text-muted-foreground">{noPriceText(model)}</p>
          <AddPricesChip onStart={onAddPrices} />
        </div>
      )}
    </section>
  );
}
