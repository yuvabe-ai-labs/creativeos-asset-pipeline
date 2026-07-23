"use client";

import { useState } from "react";
import { updateOrgCreditLimitAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "unlimited" | "set";

// Segmented Unlimited/Set-limit toggle, replacing the earlier inline click-to-edit text —
// the choice itself (unlimited vs. a number) is the primary decision here, so it's surfaced
// directly rather than hidden behind a click.
export function CreditLimitEditor({
  orgId,
  initial,
}: {
  orgId: string;
  initial: number | null;
}) {
  const [mode, setMode] = useState<Mode>(initial === null ? "unlimited" : "set");
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(raw: string) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateOrgCreditLimitAction(orgId, raw);
    setSaving(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  function selectUnlimited() {
    setMode("unlimited");
    setSaved(false);
    void save("");
  }

  function selectSet() {
    setMode("set");
    setError(null);
    setSaved(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "unlimited" ? "default" : "ghost"}
          disabled={saving}
          onClick={selectUnlimited}
        >
          Unlimited
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "set" ? "default" : "ghost"}
          disabled={saving}
          onClick={selectSet}
        >
          Set limit
        </Button>
      </div>

      {mode === "set" && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            onBlur={() => save(value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="e.g. 500"
            className="max-w-40"
          />
          {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
          {saved && !saving && <span className="text-xs text-muted-foreground">Saved</span>}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
