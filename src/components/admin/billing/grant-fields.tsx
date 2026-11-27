"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIst } from "@/lib/billing/dates";

// Credits and a last day, the two fields of Add credits.
export function CreditsInput({ value, onChange, label = "Credits" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="grant-credits">{label}</Label>
      <Input id="grant-credits" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. 10,000" autoFocus />
    </div>
  );
}

export function LastDayInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="grant-day">Last day they work</Label>
      <Input id="grant-day" type="date" min={todayIst()} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
