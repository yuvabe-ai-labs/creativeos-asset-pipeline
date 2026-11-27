"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The Add an agency popup's monthly credit limit, sent with the form as `creditLimit`: one field,
// left empty for unlimited, else the typed amount. createAgencyAction parses it like the agency
// page's editor does (parseCreditLimit).
export function CreditLimitField() {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="creditLimit">Monthly credit limit</Label>
      <Input id="creditLimit" name="creditLimit" inputMode="numeric" placeholder="Unlimited" className="max-w-48" />
    </div>
  );
}
