"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generateAllLabel, type GenerateAllPlan } from "@/lib/scripts/visualise/state";

// D345 — Generate all shows its total first ("Redraw 9 panels · about N credits"), then runs.
export function GenerateAllDialog({ plan, busy, onConfirm, variant = "default" }: {
  plan: GenerateAllPlan;
  busy: boolean;
  onConfirm: () => void;
  /** "outline" where a primary Generate all is already on the page (purple used sparingly). */
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const none = plan.shotIds.length === 0;
  return (
    <>
      <Button variant={variant} disabled={none || busy} onClick={() => setOpen(true)}>
        <Sparkles className="size-4" strokeWidth={1.5} />
        {busy ? "Drawing…" : "Generate all"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{generateAllLabel(plan)}</AlertDialogTitle>
            <AlertDialogDescription>
              Every shot without a current panel is drawn, three at a time. Each panel is billed like any image.
              {plan.waiting > 0 && ` ${plan.waiting} shot${plan.waiting === 1 ? " waits" : "s wait"} for an avatar and ${plan.waiting === 1 ? "is" : "are"} left out.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onConfirm(); }}>
              {plan.redraw ? "Redraw" : "Generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
