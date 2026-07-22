"use client";

import { useState } from "react";
import { updateOrgCreditLimitAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreditLimitEditor({
  orgId,
  initial,
}: {
  orgId: string;
  initial: number | null;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateOrgCreditLimitAction(orgId, value);
    setSaving(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Unlimited"
          className="max-w-40"
        />
        <Button onClick={onSave} disabled={saving} variant="outline" size="sm">
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
