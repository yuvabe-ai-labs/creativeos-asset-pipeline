"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import type { StatusChange } from "@/lib/admin/model-page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ReplacementOption = { id: string; label: string; provider: string };

/** A status change waiting for Save, with its guard or what it does in plain words. */
export function ModelStatusPending({
  change,
  replacement,
  replacements,
  saving,
  onReplacement,
  onSave,
  onCancel,
}: {
  change: StatusChange;
  replacement: string | null;
  replacements: ReplacementOption[];
  saving: boolean;
  onReplacement: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const saveRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Focus moves into the box when it opens, so the keyboard lands on Save (or Cancel when Save is off).
  useEffect(() => {
    (saveRef.current && !saveRef.current.disabled ? saveRef.current : cancelRef.current)?.focus();
    // Only when the box opens (the header remounts it for each status picked).
  }, []);
  const picked = replacements.find((r) => r.id === replacement);

  return (
    <div
      role="region"
      aria-label="Status change"
      className={cn(
        "mt-4 flex max-w-3xl gap-3 rounded-xl border px-4 py-3 text-sm",
        change.blocked ? "border-destructive/40 bg-destructive/5" : "border-warning/60 bg-warning/10",
      )}
    >
      <TriangleAlert aria-hidden strokeWidth={1.5} className={cn("mt-0.5 size-4 shrink-0", change.blocked ? "text-destructive-text" : "text-warning-text")} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <p>
          {change.heading && <span className="font-semibold">{change.heading} </span>}
          {change.text}
        </p>
        {change.needsReplacement && !change.blocked && (
          <Select value={replacement ?? ""} onValueChange={(v) => v && onReplacement(String(v))}>
            <SelectTrigger className="w-full max-w-72 bg-card" aria-label="Replacement">
              <SelectValue>{picked ? picked.label : replacement ? "No longer live" : "Pick a replacement"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {replacements.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label} <span className="text-xs text-muted-foreground">{r.provider}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Button ref={saveRef} size="sm" disabled={!change.canSave || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save status"}
          </Button>
          <Button ref={cancelRef} size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
