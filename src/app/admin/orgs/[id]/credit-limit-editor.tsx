"use client";

import { useState } from "react";
import { updateOrgCreditLimitAction } from "@/lib/actions/admin";
import { Input } from "@/components/ui/input";

// Inline click-to-edit, following the app's editable-field.tsx convention (dotted
// underline on hover, click to reveal an input) rather than a permanently-visible
// input+button — this component is standalone (no canvas, so no useCanvasEditable lock).
export function CreditLimitEditor({
  orgId,
  initial,
}: {
  orgId: string;
  initial: number | null;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    setError(null);
    const res = await updateOrgCreditLimitAction(orgId, draft);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      setDraft(value);
    } else {
      setValue(draft);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Unlimited"
          className="max-w-40"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
        className="w-fit cursor-pointer rounded-md px-1.5 py-1 text-left underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors hover:bg-primary/5 hover:decoration-primary/50 disabled:cursor-default disabled:opacity-60"
      >
        {saving ? "Saving…" : value === "" ? "Unlimited" : value}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
