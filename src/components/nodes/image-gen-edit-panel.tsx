"use client";

import { Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";

// 3 chips over 2 server templates (spec §1.1/§10). "freeform" = typing with no chip.
const CHIPS: Array<{ intent: EditIntent; label: string; starter: string }> = [
  { intent: "remove", label: "Remove", starter: "the cup on the table" },
  { intent: "replace", label: "Replace product", starter: "the bottle, using the connected product reference" },
  { intent: "add", label: "Add product", starter: "the connected product reference into the scene" },
];

export type ImageGenEditPanelProps = {
  intent: EditIntent;
  instruction: string;
  composedPrompt: string;
  editing: boolean;
  canEdit: boolean;
  referenceWarning: boolean;
  suggestGemini: boolean;
  onPickChip: (intent: EditIntent, starter: string) => void;
  onInstructionChange: (v: string) => void;
  onInstructionBlur: () => void;
  onEdit: () => void;
};

export function ImageGenEditPanel({
  intent,
  instruction,
  composedPrompt,
  editing,
  canEdit,
  referenceWarning,
  suggestGemini,
  onPickChip,
  onInstructionChange,
  onInstructionBlur,
  onEdit,
}: ImageGenEditPanelProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
        <span className="text-eyebrow">Edit this image</span>
      </div>

      {/* Quick-action chips — dashed-border primary chips (AGENTS.md) */}
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.intent}
            type="button"
            onClick={() => onPickChip(c.intent, c.starter)}
            className={cn(
              "nodrag inline-flex items-center rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5",
              intent === c.intent && "border-solid bg-primary/10",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Textarea
        value={instruction}
        onChange={(e) => onInstructionChange(e.target.value)}
        onBlur={onInstructionBlur}
        rows={2}
        placeholder="remove the cup… · replace the bottle with the product reference… · add the product…"
        className="nodrag resize-none text-sm"
      />

      {referenceWarning && (
        <div className="flex items-start gap-1.5 text-[0.7rem] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          <span>
            “{intent === "replace" ? "Replace" : "Add"} product” works best with a product
            reference image connected to this node.
          </span>
        </div>
      )}

      {suggestGemini && (
        <p className="text-[0.7rem] text-muted-foreground">
          Tip: Gemini (Nano Banana) models give the most faithful edits — switch the model in
          Output settings.
        </p>
      )}

      {composedPrompt && (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <p className="text-eyebrow mb-1 !text-[0.6rem]">Final prompt</p>
          <p className="text-xs leading-snug text-muted-foreground">{composedPrompt}</p>
        </div>
      )}

      <Button
        onClick={onEdit}
        disabled={editing || !canEdit || !instruction.trim()}
        className="w-full"
      >
        <Sparkles className="size-4" strokeWidth={1.5} />
        {editing ? "Editing…" : "Edit image"}
      </Button>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Generate an image, or connect an image reference, to edit it.
        </p>
      )}
    </div>
  );
}
