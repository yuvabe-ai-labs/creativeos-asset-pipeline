"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlowStepper } from "./flow-stepper";

/**
 * The When and Review steps: a modal dialog over the grid (focus stays inside; Esc or Back returns a
 * step, and focus goes back to "Next: when", or to Change prices once saved). One primary action.
 */
export function FlowDialog({
  step,
  title,
  primary,
  canGoOn,
  saving,
  onBack,
  onNext,
  children,
}: {
  step: "when" | "review" | null;
  title: string;
  primary: string;
  canGoOn: boolean;
  saving: boolean;
  onBack: () => void;
  onNext: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={step !== null} onOpenChange={(o) => !o && !saving && onBack()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        finalFocus={() => document.getElementById("change-prices-next") ?? document.getElementById("change-prices-start") ?? true}
      >
        <DialogHeader className="gap-3 px-6 pt-6 pb-4">
          <FlowStepper at={step === "review" ? 3 : 2} />
          <DialogTitle className="font-display text-lg font-semibold tracking-tight">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">{children}</div>
        <DialogFooter className="sticky bottom-0 m-0 flex-row justify-between px-6 sm:justify-between">
          <Button variant="outline" onClick={onBack} disabled={saving}>
            <ArrowLeft aria-hidden strokeWidth={1.5} />
            Back
          </Button>
          <Button onClick={onNext} disabled={!canGoOn || saving}>
            {saving && <Loader2 aria-hidden strokeWidth={1.5} className="animate-spin" />}
            {saving ? "Saving" : primary}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
