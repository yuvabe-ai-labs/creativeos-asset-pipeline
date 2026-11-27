"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { daysFromTodayIst, todayIst } from "@/lib/billing/dates";

/** Free credits last two weeks unless the admin picks another day. */
const DEFAULT_FREE_DAYS = 14;

// Add an agency's free credits, sent with the form as freeGive / freeCredits / freeUntil
// (createAgencyAction parses them with FreeCreditsFormSchema). Left empty, the agency starts with
// none; once an amount is typed, Expires at appears, set 14 days from today.
export function FreeCreditsField() {
  const [credits, setCredits] = useState("");
  const [until, setUntil] = useState(() => daysFromTodayIst(DEFAULT_FREE_DAYS));
  const giving = credits.trim() !== "";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="freeCredits">Free credits</Label>
        <Input id="freeCredits" name="freeCredits" inputMode="numeric" placeholder="None" value={credits} onChange={(e) => setCredits(e.target.value)} />
      </div>
      {giving && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="freeUntil">Expires at</Label>
          <Input id="freeUntil" name="freeUntil" type="date" min={todayIst()} value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      )}
      <Input type="hidden" name="freeGive" value={giving ? "1" : ""} />
    </div>
  );
}
