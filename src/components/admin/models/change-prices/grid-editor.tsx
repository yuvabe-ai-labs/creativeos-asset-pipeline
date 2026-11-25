"use client";

import { useRef } from "react";
import { priceGrid } from "@/lib/admin/price-grid";
import { gridKeyMove } from "@/lib/admin/grid-keys";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { PriceCellInput, type CellTarget } from "./price-cell-input";

type GridModel = Pick<AiModel, "id" | "kind" | "params" | "providerLabel">;

/**
 * The price sheet as a spreadsheet: every offered cell and each other charge is a field, starting at
 * the base row's stored price. Enter / ↑ ↓ move down and up, ← → move at the text's edge, Esc puts the
 * cell back (grid-keys.ts); Tab is the browser's own. Other charges sit below so every column shows.
 */
export function GridEditor({
  model,
  base,
  values,
  percentKeys,
  settings,
  onType,
  onReset,
}: {
  model: GridModel;
  base: AiModelPrice;
  values: Readonly<Record<string, string>>;
  percentKeys: readonly string[];
  settings: Pick<CreditSettings, "marginPercent">;
  onType: (key: string, text: string) => void;
  onReset: (key: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const g = priceGrid(model, base);
  const rows = g.cells.length;
  const cellTargets: (CellTarget | null)[][] = g.cells.map((row, r) =>
    row.map((cell, c) => (cell.offered ? { key: cell.key, meter: cell.meter, usd: cell.usd, label: cell.label, credits: cell.unit, r, c } : null)),
  );
  const charges: (CellTarget & { atCost: boolean })[] = g.otherCharges.map((o, i) => ({
    key: o.key, meter: o.meter, usd: o.usd, label: o.label, credits: null, r: rows + i, c: 0, atCost: o.atCost,
  }));
  const positions = [...cellTargets.flat(), ...charges.filter((x) => !x.atCost)].flatMap((t) => (t ? [{ r: t.r, c: t.c }] : []));

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const input = e.target as HTMLInputElement;
    if (input.dataset.r === undefined) return;
    const result = gridKeyMove(
      { key: e.key, shift: e.shiftKey },
      { r: Number(input.dataset.r), c: Number(input.dataset.c) },
      { start: input.selectionStart, end: input.selectionEnd, length: input.value.length },
      positions,
    );
    if (!result) return;
    e.preventDefault();
    if ("reset" in result) {
      // Only the cell: Esc here never closes anything around the grid.
      e.stopPropagation();
      onReset(input.dataset.cell ?? "");
      requestAnimationFrame(() => input.select());
      return;
    }
    const next = box.current?.querySelector<HTMLInputElement>(`input[data-r="${result.move.r}"][data-c="${result.move.c}"]`);
    next?.focus();
    next?.select();
  }

  const field = (t: CellTarget) => (
    <PriceCellInput target={t} typed={values[t.key]} approximate={percentKeys.includes(t.key)} settings={settings} onType={onType} />
  );

  return (
    <div ref={box} onKeyDown={onKeyDown} className="flex flex-col gap-6">
      {rows > 0 && (
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
                  <th scope="row" className="py-4 pr-3 pl-3.5 text-left text-[0.8125rem] font-medium">
                    {r.label}
                    {r.detail && <span className="block text-xs font-normal text-muted-foreground">{r.detail}</span>}
                  </th>
                  {cellTargets[i].map((t, j) => (
                    <td key={g.cells[i][j].key} className="min-w-[170px] px-3.5 py-2">
                      {t ? (
                        field(t)
                      ) : (
                        <div className="py-1.5 text-muted-foreground">
                          <div className="font-display text-[1.0625rem] font-medium">–</div>
                          <div className="text-xs">Not offered</div>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {charges.length > 0 && (
        <div className={rows > 0 ? "border-t pt-5" : undefined}>
          {rows > 0 && <h3 className="mb-1 text-sm font-semibold">Other charges</h3>}
          <table className="w-full text-[0.8125rem]">
            <tbody>
              {charges.map((t) => (
                <tr key={t.key} className="border-b align-top last:border-b-0">
                  <th scope="row" className="py-4 pr-3 text-left font-normal">{t.label}</th>
                  <td className="w-[min(50%,220px)] py-2">{t.atCost ? <span className="inline-block py-2 font-semibold">At cost</span> : field(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
