"use client";

import { formatIstDate, formatIstWhen } from "@/lib/admin/ist";
import { sheetFootnote } from "@/lib/admin/price-sheet";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { TryARun } from "@/components/admin/models/try-a-run";
import { GridEditor } from "./grid-editor";
import { KeyboardChip } from "./keyboard-chip";
import type { FlowState } from "./use-change-prices";

type SheetModel = Pick<AiModel, "id" | "kind" | "label" | "params" | "providerLabel">;

/** The price sheet while editing: the grid as fields, how many prices change, the keys, and Try a run on the new prices. */
export function PriceEditorCard({
  model,
  flow,
  base,
  after,
  changeCount,
  invalidCount,
  settings,
  onType,
  onReset,
  onKeys,
  editable,
}: {
  model: SheetModel;
  flow: FlowState;
  base: AiModelPrice;
  after: AiModelPrice;
  changeCount: number;
  invalidCount: number;
  settings: Pick<CreditSettings, "marginPercent" | "roundStep">;
  onType: (key: string, text: string) => void;
  onReset: (key: string) => void;
  onKeys: (open: boolean) => void;
  /** False for a model with no price whose kind has no price grid: there is nothing to type into here. */
  editable: boolean;
}) {
  const fromNext = flow.base === "next";
  const at = new Date(base.effectiveFrom);
  const footnote = sheetFootnote(model, base.lines.length ? base : after, settings);
  return (
    <section aria-labelledby="edit-title" className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="flex flex-wrap items-start gap-3 px-5 pt-5 pb-3.5 md:px-[22px]">
        <div className="min-w-0 flex-1">
          <h2 id="edit-title" className="font-display text-lg font-semibold tracking-tight">
            {fromNext ? `New prices for the ${formatIstDate(at, false)} change` : "New prices"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fromNext ? `Starting from the change scheduled for ${formatIstWhen(at)}.` : base.lines.length ? "Starting from today's prices." : "Enter a price for each setting."}
          </p>
        </div>
        <span aria-live="polite" className="self-center text-[0.8125rem]">
          {invalidCount ? (
            <span className="text-destructive-text">{invalidCount === 1 ? "1 cell needs a fix" : `${invalidCount} cells need a fix`}</span>
          ) : changeCount ? (
            <span className="font-semibold text-primary">{changeCount === 1 ? "1 change" : `${changeCount} changes`}</span>
          ) : (
            <span className="text-muted-foreground">No changes yet</span>
          )}
        </span>
        <KeyboardChip open={flow.keysOpen} onOpenChange={onKeys} />
      </div>
      <div className="px-5 pb-5 md:px-[22px]">
        {editable ? (
          <GridEditor model={model} base={base} values={flow.values} percentKeys={flow.percentKeys} settings={settings} onType={onType} onReset={onReset} />
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[0.8125rem] text-muted-foreground">
            The first price for this kind of model can&apos;t be entered here yet. Once it has one, its prices can be changed here.
          </p>
        )}
      </div>
      {footnote && <p className="px-5 pb-4 text-xs text-muted-foreground md:px-[22px]">{footnote}</p>}
      {(base.lines.length > 0 || after.lines.length > 0) && (
        <TryARun model={model} price={after} compare={base.lines.length ? base : null} settings={settings} />
      )}
    </section>
  );
}
