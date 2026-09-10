"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useClientId } from "@/components/canvas/client-id-context";
import { useMarket } from "@/hooks/use-market";
import { DEFAULT_SIGNAL_MODE, type SignalMode } from "@/lib/market/constants";
import { X } from "lucide-react";

type Props = {
  selected: string[];
  mode: SignalMode;
  onChange: (next: string[]) => void;
  onModeChange: (mode: SignalMode) => void;
  /** Detach every signal and put the flavour back to the default, in one patch. */
  onReset: () => void;
  className?: string;
};

/** Keyed by mode, but read positionally off SIGNAL_MODES — the slider's stops ARE
 *  that array's order, so adding an intermediate strength later needs no work here. */
const MODE_COPY: Record<SignalMode, { label: string; hint: string }> = {
  tint: {
    label: "Tint visuals",
    hint: "Only the setting moves — where and when each shot happens. Voiceover, on-screen text and caption stay exactly as written.",
  },
  rewrite: {
    label: "Rewrite full script",
    hint: "The setting moves and the copy is rewritten around the signal — hook, on-screen text, voiceover, caption. Compliance lines, links and QC notes carry through untouched.",
  },
};

const CHIP = "nodrag h-auto rounded-full px-3.5 py-2 text-sm transition-colors";
const CHIP_ON =
  "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary";
const CHIP_OFF =
  "border-border text-muted-foreground hover:bg-muted hover:text-muted-foreground";

/** Market-signal chips for the Script node (D204). One signal at a time — picking
 *  another swaps it, clicking the active one detaches. The rewrite switch appears
 *  once something is attached. Only signals that still exist are listed, so a
 *  stale id simply stops showing and drops out on the next patch. */
export function ScriptSignalsPicker({
  selected,
  mode,
  onChange,
  onModeChange,
  onReset,
  className,
}: Props) {
  const clientId = useClientId();
  const market = useMarket(clientId);
  const signals = market.data?.signals ?? [];
  const attached = signals.filter((s) => selected.includes(s.id));
  const switchId = useId(); // the picker has two homes in the focus view — no shared id

  // Single-select, though `signalIds` stays an array: two signals that disagree
  // (a festival vs. a bare-morning routine) average into mush rather than picking
  // a side. Keeping the array shape means multi-select can come back with no
  // migration and no server change — the route already dedupes and client-scopes.
  function select(id: string) {
    onChange(selected.includes(id) ? [] : [id]);
  }

  return (
    <div className={cn("grid gap-2.5", className)}>
      {/* Level 1 of three: the section owns the heading weight, and Clear lives
          here because it acts on the selection, not on the flavour. */}
      <div className="flex min-h-7 items-center gap-3">
        <Label className="text-base font-semibold">Market signals</Label>
        {attached.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="nodrag ml-auto gap-1.5 rounded-full"
          >
            <X aria-hidden className="size-4" strokeWidth={1.5} />
            Clear
          </Button>
        )}
      </div>
      {signals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {market.loading
            ? "Loading signals…"
            : "No signals yet — group references on the client's Market page."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {signals.map((s) => {
              const active = selected.includes(s.id);
              return (
                <Button
                  key={s.id}
                  type="button"
                  variant="ghost"
                  aria-pressed={active}
                  onClick={() => select(s.id)}
                  className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
                >
                  {s.name}
                  {s.tags.length > 0 && (
                    <span className="ml-1.5 opacity-60">{s.tags.join(" · ")}</span>
                  )}
                  {/* Decoration, not a nested button — the whole chip is the toggle.
                      It just makes "click again to detach" discoverable. */}
                  {active && (
                    <X aria-hidden className="ml-1 size-4 opacity-70" strokeWidth={1.5} />
                  )}
                </Button>
              );
            })}
          </div>
          {attached.length === 0 ? (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              Attach a signal to set where and when the reel is shot.
            </p>
          ) : (
            /* Level 3: subordinate to the chips above it, and it reads that way —
               a rule and a lighter label weight, no competing type size. */
            <div className="grid gap-1.5 border-t border-border/70 pt-2.5">
              {/* An on/off switch is the honest control: rewrite is a SUPERSET of
                  tint — both move the setting, rewrite additionally rewrites the
                  copy. So this toggles the increment, off is DEFAULT_SIGNAL_MODE. */}
              <Label
                htmlFor={switchId}
                className="flex w-fit cursor-pointer items-center gap-3 text-sm font-medium text-foreground"
              >
                {MODE_COPY.rewrite.label}
                <Switch
                  id={switchId}
                  className="nodrag"
                  checked={mode === "rewrite"}
                  onCheckedChange={(checked) =>
                    onModeChange(checked ? "rewrite" : DEFAULT_SIGNAL_MODE)
                  }
                />
              </Label>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {MODE_COPY[mode].hint}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
