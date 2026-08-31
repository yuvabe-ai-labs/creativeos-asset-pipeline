"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useClientId } from "@/components/canvas/client-id-context";
import { useMarket } from "@/hooks/use-market";
import type { SignalMode } from "@/lib/market/constants";

type Props = {
  selected: string[];
  mode: SignalMode;
  onChange: (next: string[]) => void;
  onModeChange: (mode: SignalMode) => void;
  className?: string;
};

const MODES: { key: SignalMode; label: string; hint: string }[] = [
  { key: "tint", label: "Tint visuals", hint: "Voiceover stays faithful; shots carry the signal" },
  { key: "rewrite", label: "Full rewrite", hint: "The whole script may adapt to the signal" },
];

const CHIP = "nodrag h-auto rounded-full px-2.5 py-1 text-xs transition-colors";
const CHIP_ON =
  "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary";
const CHIP_OFF =
  "border-border text-muted-foreground hover:bg-muted hover:text-muted-foreground";

/** Market-signal chips for the Script node (D204). Multi-select; a tint/rewrite
 *  mode row appears once something is selected. Selection is recomputed from
 *  signals that still exist, so a stale id disappears on the next patch. */
export function ScriptSignalsPicker({ selected, mode, onChange, onModeChange, className }: Props) {
  const clientId = useClientId();
  const market = useMarket(clientId);
  const signals = market.data?.signals ?? [];

  function toggle(id: string) {
    const valid = new Set(signals.map((s) => s.id));
    const next = selected.filter((sid) => valid.has(sid) && sid !== id);
    if (!selected.includes(id)) next.push(id);
    onChange(next);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label>Market signals</Label>
      {signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {market.loading
            ? "Loading signals…"
            : "No signals yet — group references on the client's Market page."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s) => {
              const active = selected.includes(s.id);
              return (
                <Button
                  key={s.id}
                  type="button"
                  variant="ghost"
                  aria-pressed={active}
                  onClick={() => toggle(s.id)}
                  className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
                >
                  {s.name}
                  {s.tags.length > 0 && (
                    <span className="ml-1 opacity-60">{s.tags.join(" · ")}</span>
                  )}
                </Button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Flavour:</span>
              {MODES.map((m) => (
                <Button
                  key={m.key}
                  type="button"
                  variant="ghost"
                  aria-pressed={mode === m.key}
                  title={m.hint}
                  onClick={() => onModeChange(m.key)}
                  className={cn(CHIP, mode === m.key ? CHIP_ON : CHIP_OFF)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Woven into extraction — every shot reflects the signal.
          </p>
        </>
      )}
    </div>
  );
}
