"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { applyEdits, buildReview, editTargets, hasEditablePrices, invalidKeys, priceChanges } from "@/lib/admin/change-prices";
import { whenProblem } from "@/lib/admin/change-prices-when";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { ModelHeader } from "@/components/admin/models/model-header";
import { PriceSheet } from "@/components/admin/models/price-sheet";
import { ChooserDialog } from "./chooser-dialog";
import { EditBar } from "./edit-bar";
import { FlowDialog } from "./flow-dialog";
import { PriceEditorCard } from "./price-editor-card";
import { ReviewStep } from "./review-step";
import { defaultWhens, useChangePrices } from "./use-change-prices";
import { useSavePrices } from "./use-save-prices";
import { WhenStep } from "./when-step";

type SheetModel = Pick<AiModel, "id" | "kind" | "label" | "params" | "providerLabel">;
type HeaderProps = Omit<React.ComponentProps<typeof ModelHeader>, "onChangePrices" | "changingPrices">;

const emptyPrice = (modelId: string): AiModelPrice => ({ id: "", modelId, effectiveFrom: "", lines: [], estimate: {}, sourceUrl: null, note: null });

/**
 * The model page's header, price sheet and side column, with the change-prices flow: Change prices
 * (or the chooser, when a change is scheduled) turns the sheet into an editable grid with an edit bar
 * above it; When and Review are dialogs; saving goes through the server checks and refreshes the page.
 */
export function ModelWorkspace({
  header,
  notice,
  aside,
  problems,
  sheet,
  prices,
  agencies,
  openOnLoad,
}: {
  header: HeaderProps;
  /** The scheduled-change notice, hidden while editing. */
  notice: React.ReactNode;
  aside: React.ReactNode;
  /** Shown in place of the sheet for a model row that fails its check. */
  problems: React.ReactNode;
  sheet: { model: SheetModel; current: AiModelPrice | null; next: AiModelPrice | null; settings: Pick<CreditSettings, "marginPercent" | "roundStep"> } | null;
  /** This model's price rows that pass their check, for replace and compare. */
  prices: AiModelPrice[];
  /** This month's runs per agency. */
  agencies: { orgName: string; runs: number }[];
  /** "?change=1" from the models list. */
  openOnLoad: boolean;
}) {
  const [flow, dispatch] = useChangePrices();
  const [now, setNow] = useState(() => new Date());
  const save = useSavePrices();
  const router = useRouter();
  const pathname = usePathname();
  const editorRef = useRef<HTMLDivElement>(null);

  function start() {
    if (!sheet) return;
    const at = new Date();
    setNow(at);
    dispatch({ type: "start", whens: defaultWhens(sheet.next, at) });
  }

  // From the models list: open once, then drop the query so a reload doesn't open it again.
  const opened = useRef(false);
  useEffect(() => {
    if (!openOnLoad || opened.current) return;
    opened.current = true;
    start();
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load
  }, [openOnLoad]);

  // The grid takes focus on its first cell when it opens (from the button or the chooser), not when a dialog closes over it.
  const editing = flow.stage === "prices" || flow.stage === "when" || flow.stage === "review";
  const lastStage = useRef(flow.stage);
  useEffect(() => {
    const from = lastStage.current;
    lastStage.current = flow.stage;
    if (flow.stage !== "prices" || (from !== "closed" && from !== "choose")) return;
    const first = editorRef.current?.querySelector<HTMLInputElement>("input[data-cell]");
    first?.focus();
    first?.select();
  }, [flow.stage]);

  const modelId = sheet?.model.id ?? header.model.id;
  const base = sheet ? (flow.base === "next" && sheet.next ? sheet.next : (sheet.current ?? emptyPrice(modelId))) : emptyPrice(modelId);
  const after: AiModelPrice = sheet && editing ? { ...base, lines: applyEdits(sheet.model, base, flow.values) } : base;
  const changeCount = sheet && editing ? priceChanges(sheet.model, base.lines.length ? base : null, after).length : 0;
  const invalidCount = sheet && editing ? invalidKeys(sheet.model, base, flow.values).length : 0;
  const review =
    sheet && flow.stage === "review"
      ? buildReview({ model: sheet.model, label: sheet.model.label, prices, base, after, when: flow.when, now, settings: sheet.settings, agencies })
      : null;

  function step(stage: "when" | "review") {
    setNow(new Date());
    dispatch({ type: "step", stage });
  }

  async function confirm() {
    if (!sheet || !review?.canSave) return;
    dispatch({ type: "saving", on: true });
    const result = await save({ modelId, label: sheet.model.label, prices, base, lines: after.lines, when: flow.when });
    if (result === "stale") {
      // The start passed while the review was open: back to When, which now says so.
      setNow(new Date());
      dispatch({ type: "stale" });
    } else dispatch(result === "saved" ? { type: "done" } : { type: "saving", on: false });
  }

  const targets = sheet && editing ? editTargets(sheet.model, base) : null;
  const hasGrid = !!targets?.cells.length;
  const otherCharges = targets?.otherCharges ?? [];

  return (
    <>
      <ModelHeader {...header} onChangePrices={sheet ? start : undefined} changingPrices={editing} />
      {editing && sheet ? (
        <EditBar
          flow={flow}
          canGoOn={changeCount > 0 && invalidCount === 0}
          hasOtherCharges={hasGrid && otherCharges.some((o) => !o.atCost)}
          scheduledAt={sheet.next ? new Date(sheet.next.effectiveFrom) : null}
          onCancel={() => dispatch({ type: "cancel" })}
          onNext={() => step("when")}
          onBulkText={(text) => dispatch({ type: "bulkText", text })}
          onIncludeOther={(on) => dispatch({ type: "includeOther", on })}
          onBulkApply={() =>
            dispatch({
              type: "bulkApply",
              cells: (targets?.cells ?? []).map((c) => ({ key: c.key, amount: c.amount })),
              otherCharges: otherCharges.map((o) => ({ key: o.key, amount: o.amount, atCost: o.atCost })),
              hasOtherCharges: hasGrid && otherCharges.some((o) => !o.atCost),
            })
          }
          onChooseAgain={() => dispatch({ type: "rechoose" })}
        />
      ) : (
        notice
      )}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {!sheet ? (
          problems
        ) : editing ? (
          <div ref={editorRef}>
            <PriceEditorCard
              model={sheet.model}
              flow={flow}
              base={base}
              after={after}
              changeCount={changeCount}
              invalidCount={invalidCount}
              settings={sheet.settings}
              onType={(key, text) => dispatch({ type: "type", key, text })}
              onReset={(key) => dispatch({ type: "reset", key })}
              onKeys={(open) => dispatch({ type: "keys", open })}
              editable={hasEditablePrices(sheet.model, base)}
            />
          </div>
        ) : (
          <PriceSheet model={sheet.model} status={header.model.status} current={sheet.current} next={sheet.next} settings={sheet.settings} onAddPrices={start} />
        )}
        {aside}
      </div>

      {sheet?.next && (
        <ChooserDialog
          open={flow.stage === "choose"}
          pick={flow.pick}
          current={sheet.current}
          next={sheet.next}
          provider={sheet.model.providerLabel}
          // Cancel returns to Change prices; Continue hides it, and the grid's first cell takes focus.
          returnFocus={() => document.getElementById("change-prices-start") ?? false}
          onPick={(pick) => dispatch({ type: "pick", pick })}
          onContinue={() => dispatch({ type: "choose" })}
          onCancel={() => dispatch({ type: "cancel" })}
        />
      )}
      {sheet && (
        <FlowDialog
          step={flow.stage === "when" || flow.stage === "review" ? flow.stage : null}
          title={flow.stage === "review" ? `Review the new prices for ${sheet.model.label}` : "When do the new prices start?"}
          primary={flow.stage === "review" ? (review?.confirm ?? "") : "Next: review"}
          canGoOn={flow.stage === "review" ? !!review?.canSave : whenProblem(flow.when, now) === null}
          saving={flow.saving}
          onBack={() => dispatch({ type: "back" })}
          onClose={() => dispatch({ type: "close" })}
          onNext={() => (flow.stage === "review" ? void confirm() : step("review"))}
        >
          {flow.stage === "review" && review ? (
            <ReviewStep review={review} label={sheet.model.label} />
          ) : (
            <WhenStep
              when={flow.when}
              now={now}
              scheduled={prices.filter((p) => new Date(p.effectiveFrom) > now).map((p) => new Date(p.effectiveFrom))}
              shortcut={sheet.next ? new Date(sheet.next.effectiveFrom) : null}
              onChange={(when) => dispatch({ type: "when", when })}
            />
          )}
        </FlowDialog>
      )}
    </>
  );
}
