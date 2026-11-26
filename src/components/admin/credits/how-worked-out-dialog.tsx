"use client";

import { stepWords, type Settings } from "@/lib/admin/credits-page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LockedSettings } from "./locked-settings";
import { WorkedExample } from "./worked-example";

/** "How is this worked out?": the sum in words, the worked example at the live settings, and the two fixed settings. */
export function HowWorkedOutDialog({ open, settings, onOpenChange }: { open: boolean; settings: Settings; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl" finalFocus={() => document.getElementById("credits-how") ?? true}>
        <DialogHeader className="gap-3 px-6 pt-6 pb-4">
          <DialogTitle className="font-display text-lg font-semibold tracking-tight">How a run&apos;s credits are worked out</DialogTitle>
          <DialogDescription className="text-[0.8125rem] text-foreground">
            We take what the run costs us, count 1 credit for every $0.001, add the margin, then round up to {stepWords(settings.roundStep)}. The estimate people see before a
            run and the final charge use the same sum.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 px-6 pb-6">
          <WorkedExample settings={settings} />
          <div>
            <LockedSettings />
          </div>
        </div>
        <DialogFooter className="m-0 px-6">
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
