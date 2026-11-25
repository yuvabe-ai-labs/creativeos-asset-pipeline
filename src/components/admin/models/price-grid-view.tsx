import { formatUsd } from "@/lib/ai-models/price-format";
import { lineKey, priceGrid, type GridCell, type OtherCharge } from "@/lib/admin/price-grid";
import { cellCredits } from "@/lib/admin/price-sheet";
import { percentChange, percentChipText } from "@/lib/admin/percent-edit";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";
import { cn } from "@/lib/utils";

type Settings = Pick<CreditSettings, "marginPercent" | "roundStep">;
type GridModel = Pick<AiModel, "id" | "kind" | "params" | "providerLabel">;

function Was({ old, now, perMillion = false }: { old: number; now: number; perMillion?: boolean }) {
  const p = percentChange(old, now);
  const text = percentChipText(p);
  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
      <s className="decoration-muted-foreground/60">{formatUsd(perMillion ? old * 1e6 : old)}</s>
      {text && p !== null && <PercentChip text={text} tone={percentTone(p)} />}
    </div>
  );
}

function Cell({ cell, old, settings }: { cell: GridCell; old: number | null; settings: Settings }) {
  if (!cell.offered || cell.usd === null) {
    return (
      <div className="text-muted-foreground">
        <div className="font-display text-[1.0625rem] font-medium">–</div>
        <div className="text-xs">{cell.offered ? "No price" : "Not offered"}</div>
      </div>
    );
  }
  const changed = old !== null && Math.abs(old - cell.usd) > 1e-12;
  return (
    <div>
      <div className={cn("font-display text-[1.0625rem] font-medium tracking-tight tabular-nums", changed && "text-primary")}>{formatUsd(cell.usd)}</div>
      <div className="text-xs tabular-nums text-muted-foreground">
        {cellCredits(cell.usd, settings)} {cell.unit === "per image" ? "credits" : "credits/s"}
      </div>
      {changed && <Was old={old} now={cell.usd} />}
    </div>
  );
}

function OtherCharges({ charges, compare }: { charges: OtherCharge[]; compare: Map<string, number> | null }) {
  return (
    <table className="w-full text-[0.8125rem]">
      <tbody>
        {charges.map((c) => {
          const old = compare?.get(c.key);
          const changed = old !== undefined && Math.abs(old - c.usd) > 1e-12;
          return (
            <tr key={c.key} className="border-b last:border-b-0">
              <td className="py-2.5 pr-3">{c.label}</td>
              <td className="py-2.5 text-right font-semibold tabular-nums">
                {c.atCost ? "At cost" : formatUsd(c.amount)}
                {changed && <Was old={old} now={c.usd} perMillion={c.perMillion} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The price sheet's body: the main price in the model's own settings, and other charges beside or below it. */
export function PriceGridView({
  model,
  price,
  compare,
  settings,
}: {
  model: GridModel;
  price: AiModelPrice;
  /** The live price, when a scheduled one is shown: changed cells show what they were. */
  compare: AiModelPrice | null;
  settings: Settings;
}) {
  const g = priceGrid(model, price);
  const was = compare ? new Map(compare.lines.map((l) => [lineKey(l.meter, l.when), l.unit_usd])) : null;
  const extras = g.otherCharges.length > 0 && <OtherCharges charges={g.otherCharges} compare={was} />;
  if (!g.cells.length) return <div>{extras}</div>;
  // With many columns, other charges go below so every column shows.
  const wide = g.colValues.length > 3;

  return (
    <div className={cn("grid grid-cols-1 items-start gap-6", extras && !wide && "md:grid-cols-[minmax(0,1fr)_240px]")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 pl-3.5 font-medium">{g.rowAxis?.label ?? ""}</th>
              {g.colValues.map((c) => (
                <th key={String(c.value)} scope="col" className="px-3.5 py-2 font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rowValues.map((r, i) => (
              <tr key={String(r.value)} className="border-b align-top last:border-b-0">
                <th scope="row" className="py-3 pr-3 pl-3.5 text-left text-[0.8125rem] font-medium">
                  {r.label}
                  {r.detail && <span className="block text-xs font-normal text-muted-foreground">{r.detail}</span>}
                </th>
                {g.cells[i].map((cell) => (
                  <td key={cell.key} className="min-w-[120px] px-3.5 py-3">
                    <Cell cell={cell} old={was?.get(cell.key) ?? null} settings={settings} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extras && (
        <div className={cn(!wide && "md:border-l md:pl-5", wide && "border-t pt-5")}>
          <h3 className="mb-1 text-sm font-semibold">Other charges</h3>
          {extras}
        </div>
      )}
    </div>
  );
}
