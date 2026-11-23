"use client";

import { useState, type ReactElement } from "react";
import { grantCreditsAction } from "@/lib/actions/billing-admin";
import type { AdminGrantKind } from "@/lib/db/billing-admin";
import { BillingChangeDialog } from "./billing-change-dialog";
import { CreditsInput, LastDayInput } from "./grant-fields";
import { SegmentedChoice } from "./segmented-choice";

// One way to add credits (D528). Both kinds cost the agency nothing and are spent by end date; they
// differ only in what the owner is shown, so the choice sits inside the dialog, preset from the
// agency: free credits before a paid plan, extra credits once it pays.
const KINDS: { value: AdminGrantKind; label: string }[] = [
  { value: "free", label: "Free credits" },
  { value: "admin", label: "Extra credits" },
];

const SHOWN: Record<AdminGrantKind, string> = {
  free: "The owner sees free credits and when they end, with a nudge to pick a plan.",
  admin: "The owner sees extra credits from Yuvabe, with no nudge. For example, to make up for a problem.",
};

export function GrantDialog({ orgId, defaultKind, trigger }: { orgId: string; defaultKind: AdminGrantKind; trigger: ReactElement }) {
  const [kind, setKind] = useState<AdminGrantKind>(defaultKind);
  const [credits, setCredits] = useState("");
  const [day, setDay] = useState("");
  return (
    <BillingChangeDialog
      trigger={trigger}
      title="Add credits"
      description="Free for the agency. Credits that end first are used first; what is left after the last day is gone."
      saveLabel="Add credits"
      onOpen={() => { setKind(defaultKind); setCredits(""); setDay(""); }}
      onSubmit={(reason) => grantCreditsAction(orgId, kind, credits, day, reason)}
    >
      <div className="flex flex-col gap-2">
        <SegmentedChoice value={kind} options={KINDS} onChange={setKind} />
        <p className="text-xs text-muted-foreground">{SHOWN[kind]}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CreditsInput value={credits} onChange={setCredits} />
        <LastDayInput value={day} onChange={setDay} />
      </div>
    </BillingChangeDialog>
  );
}
