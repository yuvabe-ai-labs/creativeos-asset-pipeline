"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlowStepper } from "./flow-stepper";

/**
 * The When and Review steps: a modal dialog over the grid (focus stays inside). Esc or the close
 * button returns to the grid; Back steps back. Focus goes back to "Next: when", or to Change prices
 * once saved. One primary action. The Credits page passes its own steps and focus targets, and opens
 * its first step here too ("settings"): there the left button is Cancel and closes the flow.
 */
export function FlowDialog({
  steps,
  focusIds = ["change-prices-next", "change-prices-start"],
  step,
  title,
  primary,
  canGoOn,
  saving,
  onBack,
  onClose,
  onNext,
  children,
}: {
  steps?: readonly [string, string, string];
  /** Where focus returns when the dialog closes: the first of these on the page. */
  focusIds?: readonly string[];
  step: "settings" | "when" | "review" | null;
  title: string;
  primary: string;
  canGoOn: boolean;
  saving: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={step !== null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        finalFocus={() => focusIds.map((id) => document.getElementById(id)).find((el) => el !== null) ?? true}
      >
        <DialogHeader className="gap-3 px-6 pt-6 pb-4">
          <FlowStepper at={step === "review" ? 3 : step === "settings" ? 1 : 2} steps={steps} />
          <DialogTitle className="font-display text-lg font-semibold tracking-tight">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">{children}</div>
        <DialogFooter className="sticky bottom-0 m-0 flex-row justify-between px-6 sm:justify-between">
          {step === "settings" ? (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={onBack} disabled={saving}>
              <ArrowLeft aria-hidden strokeWidth={1.5} />
              Back
            </Button>
          )}
          <Button onClick={onNext} disabled={!canGoOn || saving}>
            {saving && <Loader2 aria-hidden strokeWidth={1.5} className="animate-spin" />}
            {saving ? "Saving" : primary}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
