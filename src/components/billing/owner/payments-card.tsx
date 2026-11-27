"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OwnerPaymentsPage } from "@/lib/db/billing-owner";
import { PaymentsList } from "./payments-list";

const SHOWN = 3;

// Payments in the Usage page's side column (D597): the newest three, and See all opening every
// payment in a side panel, a page at a time.
export function PaymentsCard({ initial }: { initial: OwnerPaymentsPage }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="gap-1 p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">Payments</h2>
        {initial.total > SHOWN && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            See all {initial.total.toLocaleString("en-IN")}
          </Button>
        )}
      </div>
      <PaymentsList initial={initial} limit={SHOWN} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b border-border p-5 pr-12">
            <SheetTitle className="font-display text-base font-semibold tracking-tight">Payments</SheetTitle>
            <SheetDescription>Newest first. Amounts include GST.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <PaymentsList initial={initial} />
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
