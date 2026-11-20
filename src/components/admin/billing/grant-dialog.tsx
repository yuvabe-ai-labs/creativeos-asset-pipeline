"use client";

import { useState, type ReactElement } from "react";
import { grantCreditsAction } from "@/lib/actions/billing-admin";
import { BillingChangeDialog } from "./billing-change-dialog";
import { CreditsInput, LastDayInput } from "./grant-fields";

const COPY = {
  free: { title: "Give free credits", description: "Used before plan credits. What is left after the last day is gone.", save: "Give free credits" },
  admin: { title: "Add credits", description: "Extra credits from Yuvabe, for example to make up for a problem.", save: "Add credits" },
} as const;

export function GrantDialog({ orgId, kind, trigger }: { orgId: string; kind: "free" | "admin"; trigger: ReactElement }) {
  const [credits, setCredits] = useState("");
  const [day, setDay] = useState("");
  const copy = COPY[kind];
  return (
    <BillingChangeDialog
      trigger={trigger}
      title={copy.title}
      description={copy.description}
      saveLabel={copy.save}
      onOpen={() => { setCredits(""); setDay(""); }}
      onSubmit={(reason) => grantCreditsAction(orgId, kind, credits, day, reason)}
    >
      <div className="grid grid-cols-2 gap-3">
        <CreditsInput value={credits} onChange={setCredits} />
        <LastDayInput value={day} onChange={setDay} />
      </div>
    </BillingChangeDialog>
  );
}
