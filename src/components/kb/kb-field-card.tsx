"use client";

import { XIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableField } from "@/components/nodes/editable-field";
import { KBColorSwatches } from "@/components/kb/kb-color-swatches";
import { Button } from "@/components/ui/button";
import type { KBField } from "@/lib/kb/schema";
import { COLOUR_FIELD_KEYS } from "@/lib/kb/constants";
import { isListField } from "@/lib/kb/utils";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** A list value shown as quiet chips, one per comma-separated entry. */
function ValueChips({ value }: { value: string }) {
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <span className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span key={i} className="rounded-md border border-border bg-card px-2.5 py-1 text-[0.8125rem] leading-snug text-foreground">
          {item}
        </span>
      ))}
    </span>
  );
}

const ACTION = "size-7 rounded-md p-0 text-muted-foreground hover:bg-primary/5 hover:text-primary";

type Props = {
  fieldKey: string;
  label: string;
  field: KBField<unknown>;
  onEdit: (newValue: string | string[]) => void;
  onApprove: () => void;
  onReject: () => void;
};

/**
 * One brand KB field on the review step's card grid: a header strip (purple kicker, tracked label,
 * "inferred" note, and the field's actions, shown on hover or focus) over a click-to-edit value.
 * List fields show as chips, colour fields as swatches. Review state (approved / edited) is
 * intentionally NOT shown per field; the at-a-glance signal is the section's tick. Rejected keeps a
 * line-through label and value. The extraction's confidence is kept on the field but not shown.
 */
export function KBFieldCard({ fieldKey, label, field, onEdit, onApprove, onReject }: Props) {
  const isArray = isListField(fieldKey, field.value);
  const displayValue = formatValue(field.value);
  const isEmpty = !field.value || (Array.isArray(field.value) && field.value.length === 0);
  const isRejected = field.status === "rejected";
  const isColorField = COLOUR_FIELD_KEYS.has(fieldKey);

  // Commit an inline edit. Arrays are stored back as a comma-split list; a manual
  // edit always lands as status "edited" (EditableField fires onCommit only when
  // the value actually changed, so a no-op click won't flip the status).
  function commitEdit(next: string) {
    const parsed = isArray
      ? next.split(",").map((s) => s.trim()).filter(Boolean)
      : next.trim();
    onEdit(parsed);
  }

  return (
    <section className="group/field flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2 pr-2.5 pl-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden className="mt-0.5 h-3.5 w-[3px] shrink-0 rounded-full bg-primary/70" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("text-eyebrow truncate", isRejected && "text-muted-foreground line-through")}>{label}</span>
            {field.evidence_type === "inferred" && (
              <span title="Not found in the sources — inferred by AI" className="text-[0.6875rem] text-muted-foreground">
                inferred
              </span>
            )}
          </div>
        </div>

        {/* Shown on hover or keyboard focus, like the artifact's field actions; always on touch. */}
        <div className="flex h-7 shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-focus-within/field:opacity-100 group-hover/field:opacity-100 [@media(hover:none)]:opacity-100">
          {isRejected ? (
            <Button
              type="button"
              variant="link"
              onClick={() => onEdit((field.value as string | string[]) ?? "")}
              className="h-auto px-1.5 py-0 text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground"
            >
              Restore
            </Button>
          ) : (
            <>
              {isEmpty && field.status === "needs_review" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onApprove}
                  title="Approve — confirm this field is empty"
                  aria-label={`Approve ${label} as empty`}
                  className={cn(ACTION, "hover:bg-success/10 hover:text-success-text")}
                >
                  <CheckIcon className="size-3.5" strokeWidth={1.5} />
                </Button>
              )}
              {!isEmpty && (
                <Button type="button" variant="ghost" onClick={onReject} title="Reject" aria-label={`Reject ${label}`} className={ACTION}>
                  <XIcon className="size-3.5" strokeWidth={1.5} />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 px-4 pt-3 pb-4 leading-relaxed">
        {isRejected ? (
          <p className="text-sm text-muted-foreground line-through">{isEmpty ? "No data extracted" : displayValue}</p>
        ) : (
          <EditableField
            value={displayValue}
            onCommit={commitEdit}
            multiline
            placeholder={isArray ? "Add values, comma-separated…" : "Add value…"}
            className="text-sm"
            renderDisplay={
              isColorField ? (v) => <KBColorSwatches value={v} /> : isArray ? (v) => <ValueChips value={v} /> : undefined
            }
          />
        )}
      </div>
    </section>
  );
}
