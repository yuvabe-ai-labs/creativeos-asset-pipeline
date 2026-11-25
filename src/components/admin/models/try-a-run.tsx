"use client";

import { useState } from "react";
import { runSpec, type RunChoice, type RunSpec } from "@/lib/admin/typical-runs";
import { tryARun, tryRunOptions, type RunOptionGroup, type RunOptionValue } from "@/lib/admin/price-sheet";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type RunModel = Pick<AiModel, "id" | "kind" | "label" | "params" | "providerLabel">;

/** The value a group shows as chosen: the run's own setting, so the model's defaults start selected. */
function chosen(spec: RunSpec, field: RunOptionGroup["field"]): RunOptionValue | null {
  if (field === "seconds") return "seconds" in spec ? spec.seconds : null;
  if (field === "references") return spec.kind === "image" ? spec.references : null;
  if (spec.kind !== "image" && spec.kind !== "video") return null;
  return field === "row" ? spec.row : spec.col;
}

/** "Try a run": one run at settings the admin picks, in credits at the live settings; against the live price when a scheduled one is shown. */
export function TryARun({
  model,
  price,
  compare,
  settings,
}: {
  model: RunModel;
  price: AiModelPrice;
  compare: AiModelPrice | null;
  settings: Pick<CreditSettings, "marginPercent" | "roundStep">;
}) {
  const [choice, setChoice] = useState<RunChoice>({});
  const spec = runSpec(model, price, choice);
  const result = tryARun(model, price, compare, choice, settings);
  if (!spec || !result) return null;
  const groups = tryRunOptions(model, price);

  return (
    <div className="flex flex-wrap items-center gap-5 border-t bg-muted/40 px-5 py-4 md:px-[22px]">
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
        <h3 className="text-sm font-semibold">
          Try a run <span className="font-medium text-muted-foreground">{result.label}</span>
        </h3>
        {groups.map((g) => {
          const current = chosen(spec, g.field);
          return (
            <div key={g.field} className="flex flex-wrap items-center gap-2.5">
              <span id={`try-${g.field}`} className="w-20 text-[0.8rem] text-muted-foreground">{g.label}</span>
              <ToggleGroup
                aria-labelledby={`try-${g.field}`}
                spacing={1.5}
                className="flex-wrap"
                value={current === null ? [] : [String(current)]}
                onValueChange={(vals: string[]) => {
                  const picked = g.options.find((o) => String(o.value) === vals[0]);
                  if (picked) setChoice((c) => ({ ...c, [g.field]: picked.value }));
                }}
              >
                {g.options.map((o) => (
                  <ToggleGroupItem
                    key={String(o.value)}
                    value={String(o.value)}
                    variant="outline"
                    size="sm"
                    className="rounded-full bg-card aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
                  >
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          );
        })}
      </div>
      <div aria-live="polite" className="ml-auto text-right">
        {result.credits === null ? (
          <p className="text-sm text-muted-foreground">{result.text}</p>
        ) : (
          <>
            <p className="flex items-baseline justify-end gap-2">
              {result.before && result.before.credits !== null && result.before.credits !== result.credits && (
                <s className="font-display text-lg tabular-nums text-muted-foreground decoration-muted-foreground/60">
                  {result.before.credits.toLocaleString("en-US")}
                </s>
              )}
              <span className="font-display text-[1.75rem] font-semibold tracking-tight tabular-nums">{result.credits.toLocaleString("en-US")}</span>
              <span className="text-sm text-muted-foreground">credits</span>
            </p>
            <p className="flex items-center justify-end gap-1.5 text-xs tabular-nums text-muted-foreground">
              {result.text}
              {result.percent && <PercentChip text={result.percent.text} tone={percentTone(result.percent.value)} />}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
