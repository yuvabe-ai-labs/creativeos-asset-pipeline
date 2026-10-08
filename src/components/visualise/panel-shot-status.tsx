"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import type { PanelView } from "@/lib/scripts/visualise/state";

// The board's per-shot line in the script pane: "Panel" when the picked take is current, the
// dashed "Generate panel" chip when it can be drawn, otherwise the state in a word. The full
// detail (badge, reason, cost, takes) lives on the panel's tile in the Storyboard.
export function PanelShotStatus({ view, credits, onDraw }: { view: PanelView; credits: number | null; onDraw: () => void }) {
  const quiet = "whitespace-nowrap text-xs font-medium text-muted-foreground";
  if (view.status === "generating") return <span className={quiet}>Drawing…</span>;
  if (view.status === "out_of_date") return <span className={quiet}>Out of date</span>;
  if (view.pick) {
    return (
      <span className={`${quiet} inline-flex items-center gap-1`}>
        <Check className="size-3.5" strokeWidth={1.5} aria-hidden />Panel
      </span>
    );
  }
  if (!view.canGenerate) return <span className={quiet}>Waits for avatar</span>;
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={credits === null}
      onClick={onDraw}
      className="border border-dashed border-primary/40 text-primary hover:bg-primary/5"
    >
      {view.failure ? "Generate again" : "Generate panel"}
      <AvatarCreditCost credits={credits} />
    </Button>
  );
}
