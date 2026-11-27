"use client";

import { useState, type ReactElement } from "react";
import { takeBackCreditsAction } from "@/lib/actions/billing-admin";
import type { OpenGrant } from "@/lib/billing/grants";
import { BillingChangeDialog } from "./billing-change-dialog";
import { CreditsInput } from "./grant-fields";
import { GRANT_KIND_LABEL } from "./billing-labels";

export function TakeBackDialog({ orgId, grant, trigger }: { orgId: string; grant: OpenGrant; trigger: ReactElement }) {
  const [credits, setCredits] = useState("");
  return (
    <BillingChangeDialog
      trigger={trigger}
      title={`Take back ${GRANT_KIND_LABEL[grant.kind].toLowerCase()}`}
      description={`Up to ${grant.left.toLocaleString("en-US")} credits are left to take back.`}
      saveLabel="Take back"
      onOpen={() => setCredits("")}
      onSubmit={(reason) => takeBackCreditsAction(orgId, grant.id, credits, reason)}
    >
      <CreditsInput value={credits} onChange={setCredits} label="Credits to take back" />
    </BillingChangeDialog>
  );
}
