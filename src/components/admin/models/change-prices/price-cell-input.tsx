"use client";

import { displayAmount, formatUsd } from "@/lib/ai-models/price-format";
import { cellState, editText } from "@/lib/admin/change-prices";
import { cellCredits } from "@/lib/admin/price-sheet";
import { percentChipText } from "@/lib/admin/percent-edit";
import type { CreditSettings, Meter } from "@/lib/ai-models/types";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type CellTarget = {
  key: string;
  meter: Meter;
  usd: number | null;
  /** Plain, for screen readers: "720p, price per second". */
  label: string;
  /** A main-grid cell shows credits under it; an other charge says Unchanged. */
  credits: "per second" | "per image" | null;
  r: number;
  c: number;
};

function Rounded() {
  return (
    <span title="Rounded to 4 significant figures" className="text-muted-foreground">
      ≈ rounded
    </span>
  );
}

/** The line under a cell: credits or Unchanged, the old price struck with the new one and its change, or what to fix. */
function CellMeta({ target, typed, approximate, settings }: { target: CellTarget; typed: string | undefined; approximate: boolean; settings: Pick<CreditSettings, "marginPercent"> }) {
  const s = cellState(target.meter, target.usd, typed, approximate);
  const unit = target.credits === "per image" ? "credits" : "credits/s";
  const credits = (usd: number) => (target.credits ? `${cellCredits(usd, settings)} ${unit}` : "");
  const money = (usd: number) => formatUsd(displayAmount(target.meter, usd));
  switch (s.kind) {
    case "empty":
      return <span>No price yet</span>;
    case "unchanged":
      return <span>{target.credits && target.usd !== null ? credits(target.usd) : "Unchanged"}</span>;
    case "invalid":
      return <span className="text-destructive-text">Not a price. Type 0.07 or −31%.</span>;
    case "new":
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <PercentChip text="New" tone="new" />
          {credits(s.usd)}
          {s.approximate && <Rounded />}
        </span>
      );
    case "changed": {
      const chip = percentChipText(s.percent);
      return (
        <>
          <span className="flex flex-wrap items-center gap-1.5">
            <s className="decoration-muted-foreground/60">{money(s.oldUsd)}</s>
            <span>
              → <span className="font-medium text-foreground">{money(s.usd)}</span>
            </span>
            {chip && s.percent !== null && <PercentChip text={chip} tone={percentTone(s.percent)} />}
            {s.approximate && <Rounded />}
          </span>
          {s.big && <span className="block text-destructive-text">Big change. Check it isn&apos;t a typo.</span>}
        </>
      );
    }
  }
}

/** One editable price: "$" and the amount (per 1M for tokens), with what the entry means under it. */
export function PriceCellInput({
  target,
  typed,
  approximate,
  settings,
  onType,
}: {
  target: CellTarget;
  typed: string | undefined;
  approximate: boolean;
  settings: Pick<CreditSettings, "marginPercent">;
  onType: (key: string, text: string) => void;
}) {
  const s = cellState(target.meter, target.usd, typed, approximate);
  const changed = s.kind === "changed" || s.kind === "new";
  const invalid = s.kind === "invalid";
  const metaId = `meta-${target.key}`;
  return (
    <div className={cn("-mx-1.5 rounded-lg px-1.5 py-1.5 transition-colors duration-200", changed && "bg-primary/5", invalid && "bg-destructive/5")}>
      <InputGroup className="w-full max-w-[180px] bg-card">
        <InputGroupAddon aria-hidden className="pr-0 text-muted-foreground">$</InputGroupAddon>
        <InputGroupInput
          value={typed ?? editText(target.meter, target.usd)}
          placeholder={target.usd === null ? "Add" : undefined}
          onChange={(e) => onType(target.key, e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={target.label}
          aria-invalid={invalid || undefined}
          aria-describedby={metaId}
          autoComplete="off"
          spellCheck={false}
          inputMode="decimal"
          data-cell={target.key}
          data-r={target.r}
          data-c={target.c}
          className="font-semibold tabular-nums"
        />
      </InputGroup>
      <div id={metaId} aria-live="polite" className="mt-1 text-xs tabular-nums text-muted-foreground">
        <CellMeta target={target} typed={typed} approximate={approximate} settings={settings} />
      </div>
    </div>
  );
}
