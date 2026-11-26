"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditLimitToggle, type CreditLimitMode } from "./credit-limit-toggle";

// The Add an agency popup's monthly credit limit, sent with the form as `creditLimit`: blank for
// Unlimited (the default), else the typed amount. createAgencyAction parses it like the agency
// page's editor does (parseCreditLimit).
export function CreditLimitField() {
  const [mode, setMode] = useState<CreditLimitMode>("unlimited");
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Monthly credit limit</Label>
      <CreditLimitToggle
        mode={mode}
        onUnlimited={() => {
          setMode("unlimited");
          setDraft("");
        }}
        onSet={() => setMode("set")}
      />
      {mode === "set" && (
        <Input
          autoFocus
          aria-label="Monthly credit limit"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. 500"
          className="max-w-40"
        />
      )}
      <Input type="hidden" name="creditLimit" value={mode === "unlimited" ? "" : draft} />
    </div>
  );
}
