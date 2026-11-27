"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIst } from "@/lib/billing/dates";
import { SegmentedChoice } from "./segmented-choice";

// Add an agency's "Free credits to start", sent with the form as freeGive / freeCredits /
// freeUntil (createAgencyAction parses them with FreeCreditsFormSchema). No default amount or day.
export function FreeCreditsField() {
  const [give, setGive] = useState<"none" | "give">("none");
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Free credits to start</Label>
      <SegmentedChoice
        value={give}
        options={[{ value: "none", label: "None" }, { value: "give", label: "Give free credits" }]}
        onChange={setGive}
      />
      {give === "give" && (
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="freeCredits" className="text-xs text-muted-foreground">Credits</Label>
            <Input id="freeCredits" name="freeCredits" inputMode="numeric" placeholder="e.g. 50,000" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="freeUntil" className="text-xs text-muted-foreground">Last day they work</Label>
            <Input id="freeUntil" name="freeUntil" type="date" min={todayIst()} />
          </div>
        </div>
      )}
      <Input type="hidden" name="freeGive" value={give === "give" ? "1" : ""} />
      {give === "give" && <p className="text-xs text-muted-foreground">Used before plan credits. What is left after the last day is gone.</p>}
    </div>
  );
}
