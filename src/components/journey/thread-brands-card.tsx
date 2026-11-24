"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BrandsCard, MarketBrand } from "@/lib/journey/thread/schema";

const GROUPS: { group: MarketBrand["group"]; label: string; hint: string }[] = [
  { group: "direct", label: "Direct", hint: "Same buyer, same category" },
  { group: "adjacent", label: "Adjacent", hint: "Same audience, or worth borrowing from" },
];

const SETTLED: Record<Exclude<BrandsCard["status"], "pending">, string> = {
  fetching: "Bringing in their posts…",
  fetched: "Posts brought in. They are in Direct and Adjacent.",
  stale: "Replaced by a newer list.",
};

/** The brands the market agent proposes to look at (D530 step 1), in the two tabs they would fill.
 *  The person switches off the ones they don't want; nothing is fetched until they press the button
 *  (or tell the copilot to). Corrections like "add @brandY" go through the chat. */
export function ThreadBrandsCard({ id, card, busy, onConfirm, onSwitch }: {
  id: string;
  card: BrandsCard;
  busy: boolean;
  onConfirm: (keep: string[]) => void;
  /** Stores the switches as they are flipped, so a "fetch" typed in the chat honours them. */
  onSwitch?: (keep: string[]) => void;
}) {
  const pending = card.status === "pending";
  // Starts from what the card holds (the chat may have switched some off); this browser's own
  // switches are laid over it until the card is confirmed.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const kept = (b: MarketBrand) => toggled[b.handle] ?? b.keep;
  const keep = card.brands.filter(kept).map((b) => b.handle);

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      {card.focus && <p className="text-sm text-muted-foreground">Looking into: {card.focus}</p>}
      {GROUPS.map(({ group, label, hint }) => {
        const brands = card.brands.filter((b) => b.group === group);
        if (brands.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <p className="text-eyebrow text-muted-foreground">{label} <span className="normal-case tracking-normal">· {hint}</span></p>
            <ul className="flex flex-col gap-2">
              {brands.map((b) => {
                const switchId = `${id}-${b.handle}`;
                return (
                  <li key={b.handle} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className={pending && !kept(b) ? "text-muted-foreground line-through decoration-muted-foreground/50" : undefined}>
                        <span className="font-medium">@{b.handle}</span>
                        {b.name && b.name !== b.handle && <span className="text-muted-foreground"> · {b.name}</span>}
                      </p>
                      {b.why && <p className="text-xs text-muted-foreground">{b.why}</p>}
                    </div>
                    {pending && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Label htmlFor={switchId} className="sr-only">Fetch @{b.handle}</Label>
                        <Switch
                          id={switchId}
                          size="sm"
                          checked={kept(b)}
                          disabled={busy}
                          onCheckedChange={(checked) => {
                            const next = { ...toggled, [b.handle]: checked };
                            setToggled(next);
                            onSwitch?.(card.brands.filter((x) => next[x.handle] ?? x.keep).map((x) => x.handle));
                          }}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {card.status === "pending" ? (
        <div className="flex flex-col gap-1.5">
          <Button size="sm" className="self-start" disabled={busy || keep.length === 0} onClick={() => onConfirm(keep)}>
            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden />}
            Fetch their posts ({keep.length})
          </Button>
          <p className="text-xs text-muted-foreground">Nothing is fetched until you press this or tell me to.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{SETTLED[card.status]}</p>
      )}
    </div>
  );
}
