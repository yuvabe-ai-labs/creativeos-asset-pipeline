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

type Props = {
  fieldKey: string;
  label: string;
  field: KBField<unknown>;
  onEdit: (newValue: string | string[]) => void;
  onApprove: () => void;
  onReject: () => void;
};

export function KBFieldRow({
  fieldKey,
  label,
  field,
  onEdit,
  onApprove,
  onReject,
}: Props) {

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

  // Gutter: an editorial section label with a constant purple kicker rule —
  // mirrors the Section gutter in script-document.tsx. Review state (approved /
  // edited) is intentionally NOT shown per-field; the only at-a-glance signal is
  // the per-module tick on the tab. Rejected keeps a line-through label. The extraction's
  // confidence (high / medium / low) is kept on the field but not shown.
  return (
    <section className="grid gap-x-10 gap-y-2.5 sm:grid-cols-[160px_1fr]">
      <div className="self-start sm:sticky sm:top-2">
        <div className="mb-2 h-0.5 w-6 rounded-full bg-primary/70" aria-hidden />
        <span
          className={cn(
            "text-eyebrow",
            isRejected && "text-muted-foreground line-through",
          )}
        >
          {label}
        </span>
        {field.evidence_type === "inferred" && (
          <span className="mt-1.5 block text-[0.6rem] text-muted-foreground">inferred</span>
        )}
      </div>

      <div className="min-w-0 leading-relaxed">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isRejected ? (
              <p className="text-sm text-muted-foreground line-through">
                {isEmpty ? "No data extracted" : displayValue}
              </p>
            ) : (
              <EditableField
                value={displayValue}
                onCommit={commitEdit}
                multiline
                placeholder={isArray ? "Add values, comma-separated…" : "Add value…"}
                className="text-sm"
                renderDisplay={
                  isColorField
                    ? (v) => <KBColorSwatches value={v} />
                    : undefined
                }
              />
            )}
          </div>

          {/* Action buttons — pinned top-right of the content column */}
          <div className="flex shrink-0 items-center gap-1">
              {isRejected ? (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => onEdit((field.value as string | string[]) ?? "")}
                  className="h-auto p-0 text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground"
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
                      className="size-6 rounded-md p-0 text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30"
                    >
                      <CheckIcon className="size-3.5" />
                    </Button>
                  )}
                  {!isEmpty && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onReject}
                      title="Reject"
                      className="size-6 rounded-md p-0 text-muted-foreground dark:hover:bg-muted"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  )}
                </>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
