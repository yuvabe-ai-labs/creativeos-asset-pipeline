"use client";

import { useRef, useState } from "react";
import { updateOrgCreditLimitAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "unlimited" | "set";

// Segmented Unlimited/Set-limit toggle. "Unlimited" is a single unambiguous action and
// saves immediately; "Set limit" reveals an input with explicit Save/Cancel — no
// save-on-blur, so an accidental click away never silently commits a half-typed value.
export function CreditLimitEditor({
  orgId,
  initial,
}: {
  orgId: string;
  initial: number | null;
}) {
  const [mode, setMode] = useState<Mode>(initial === null ? "unlimited" : "set");
  const [committedValue, setCommittedValue] = useState(
    initial === null ? "" : String(initial),
  );
  const [draft, setDraft] = useState(committedValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only true right after the admin clicks "Set limit" — an org that already has a
  // limit renders straight into mode "set" on page load, and that mount must NOT
  // steal focus (YUV-291: it risked an accidental edit before the admin typed anything).
  const focusOnMountRef = useRef(false);

  async function save(raw: string) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateOrgCreditLimitAction(orgId, raw);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCommittedValue(raw);
    setSaved(true);
  }

  function selectUnlimited() {
    setMode("unlimited");
    setDraft("");
    setError(null);
    void save("");
  }

  function selectSet() {
    setMode("set");
    setDraft(committedValue);
    setError(null);
    setSaved(false);
    focusOnMountRef.current = true;
  }

  function cancelEdit() {
    setDraft(committedValue);
    setError(null);
    if (committedValue === "") setMode("unlimited");
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
            ref={(el) => {
              if (el && focusOnMountRef.current) {
                el.focus();
                focusOnMountRef.current = false;
              }
            }}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
              if (e.key === "Enter") {
                e.preventDefault();
                void save(draft);
              }
            }}
            placeholder="e.g. 500"
            className="max-w-40"
          />
          {draft !== committedValue && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => void save(draft)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
            </>
          )}
          {saved && !saving && <span className="text-xs text-muted-foreground">Saved</span>}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
