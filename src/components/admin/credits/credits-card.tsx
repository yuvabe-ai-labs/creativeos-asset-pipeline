"use client";

import { useState } from "react";
import { CircleCheck, ChevronDown, Lock } from "lucide-react";
import type { NextChange } from "@/lib/admin/credits-overview";
import type { Settings } from "@/lib/admin/credits-page";
import type { PriceTimeline } from "@/lib/admin/price-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditHistory } from "./credit-history";
import { CreditsRow } from "./credits-row";
import { HowCreditsWorkedOut } from "./how-credits-worked-out";
import { NextChangeRow } from "./next-change-row";

type Panel = "how" | "history";
const PANELS: { id: Panel; label: string }[] = [
  { id: "how", label: "How credits are worked out" },
  { id: "history", label: "History" },
];

/**
 * The one card on the Credits page (D594): Now, Next, the fixed credit rate, and two disclosures that
 * open in place under it, one at a time.
 */
export function CreditsCard({
  now,
  live,
  next,
  history,
}: {
  now: { line: string; since: string };
  live: Settings;
  next: NextChange | null;
  history: { timeline: PriceTimeline; kept: Record<string, string> };
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  return (
    <section aria-label="Credit settings" className="max-w-4xl overflow-hidden rounded-xl border bg-card shadow-card">
      <CreditsRow
        icon={<CircleCheck aria-hidden strokeWidth={1.5} className="size-4 text-muted-foreground/70" />}
        label={<span className="font-normal text-muted-foreground">Now</span>}
        action={<span className="text-xs text-muted-foreground">{now.since}</span>}
      >
        <span className="font-semibold">{now.line}</span>
      </CreditsRow>
      <NextChangeRow next={next} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-muted/40 px-4 py-3 md:px-5">
        <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <Lock aria-hidden strokeWidth={1.5} className="size-3.5" />
          1 credit is $0.001 of what we pay, always.
        </span>
        <span className="flex-1" />
        {PANELS.map((p) => (
          <Button
            key={p.id}
            variant="ghost"
            size="sm"
            aria-expanded={open === p.id}
            aria-controls={`credits-panel-${p.id}`}
            onClick={() => setOpen((o) => (o === p.id ? null : p.id))}
            className="-mx-2 text-muted-foreground aria-expanded:text-foreground"
          >
            {p.label}
            <ChevronDown aria-hidden strokeWidth={1.5} className={cn("transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", open === p.id && "rotate-180")} />
          </Button>
        ))}
      </div>
      {open && (
        <div id={`credits-panel-${open}`} className="border-t px-4 pt-4 pb-5 md:px-5">
          {open === "how" ? <HowCreditsWorkedOut settings={live} /> : <CreditHistory timeline={history.timeline} kept={history.kept} />}
        </div>
      )}
    </section>
  );
}
