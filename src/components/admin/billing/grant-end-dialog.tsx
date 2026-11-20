"use client";

import { useState, type ReactElement } from "react";
import { setGrantEndAction } from "@/lib/actions/billing-admin";
import { formatDay, lastDayOf } from "@/lib/billing/dates";
import type { OpenGrant } from "@/lib/billing/grants";
import { BillingChangeDialog } from "./billing-change-dialog";
import { LastDayInput } from "./grant-fields";
import { SegmentedChoice } from "./segmented-choice";

// Change end date, or End now: both on one dialog (spec §3).
export function GrantEndDialog({ orgId, grant, trigger }: { orgId: string; grant: OpenGrant; trigger: ReactElement }) {
  const [when, setWhen] = useState<"day" | "now">("day");
  const [day, setDay] = useState(lastDayOf(grant.endsAt));
  return (
    <BillingChangeDialog
      trigger={trigger}
      title="Change end date"
      description={`They work until ${formatDay(lastDayOf(grant.endsAt))} now. Ending them now stops what is left from being used.`}
      saveLabel={when === "now" ? "End now" : "Save end date"}
      onOpen={() => { setWhen("day"); setDay(lastDayOf(grant.endsAt)); }}
      onSubmit={(reason) => setGrantEndAction(orgId, grant.id, when === "now" ? null : day, reason)}
    >
      <SegmentedChoice value={when} options={[{ value: "day", label: "New last day" }, { value: "now", label: "End now" }]} onChange={setWhen} />
      {when === "day" && <LastDayInput value={day} onChange={setDay} />}
    </BillingChangeDialog>
  );
}
