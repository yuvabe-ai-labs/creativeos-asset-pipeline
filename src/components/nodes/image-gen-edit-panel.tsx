"use client";

import { Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import type { UpstreamNode } from "./connected-inputs-card";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

// Quick-action chips. The instruction is the bare target; the chip's template supplies the
// verb (remove / replace / add). "modify" shares the change-only template but is a labeled
// action; "freeform" = typing with no chip.
const CHIPS: Array<{ intent: EditIntent; label: string; starter: string }> = [
  { intent: "remove", label: "Remove", starter: "the cup on the table" },
  {
    intent: "replace",
    label: "Replace product",
    starter: "the bottle on the shelf",
  },
  { intent: "add", label: "Add product", starter: "it to the scene" },
  {
    intent: "modify",
    label: "Modify",
    starter: "recolor the label to matte black",
  },
];

export type ImageGenEditPanelProps = {
  intent: EditIntent;
  instruction: string;
  upstream: UpstreamNode[];
  finalPrompt: string;
  editing: boolean;
  canEdit: boolean;
  referenceWarning: boolean;
  suggestGemini: boolean;
  onPickChip: (intent: EditIntent, starter: string) => void;
  onInstructionChange: (v: string) => void;
  onInstructionBlur: () => void;
  onFinalPromptChange: (v: string) => void;
  onEdit: () => void;
  estimatedCredits: number | null;
  estimating: boolean;
};

export function ImageGenEditPanel({
  intent,
  instruction,
  upstream,
  finalPrompt,
  editing,
  canEdit,
  referenceWarning,
  suggestGemini,
  onPickChip,
  onInstructionChange,
  onInstructionBlur,
  onFinalPromptChange,
  onEdit,
  estimatedCredits,
  estimating,
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
          <Button
            key={c.intent}
            type="button"
            variant="ghost"
            onClick={() => onPickChip(c.intent, c.starter)}
            className={cn(
              "nodrag inline-flex h-auto items-center rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5",
              intent === c.intent && "border-solid bg-primary/10"
            )}
          >
            {c.label}
          </Button>
        ))}
      </div>
      <MentionInstructionEditor
        value={instruction}
        onChange={onInstructionChange}
        placeholder="remove the cup… · replace the bottle with the product reference… · add the product…"
        upstream={upstream}
        className="nodrag min-h-16"
      />
      {referenceWarning && (
        <div className="flex items-start gap-1.5 text-[0.7rem] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          <span>
            “{intent === "replace" ? "Replace" : "Add"} product” works best with
            a product reference image. Tick one under “References for this edit”
            — connecting it is not enough, only ticked references are sent.
          </span>
        </div>
      )}
      {suggestGemini && (
        <p className="text-[0.7rem] text-muted-foreground">
          Tip: Gemini (Nano Banana) models give the most faithful edits — switch
          the model in Output settings.
        </p>
      )}
      <div>
        <p className="text-eyebrow mb-1 !text-[0.6rem]">
          Final prompt — editable
        </p>
        <Textarea
          value={finalPrompt}
          onChange={(e) => onFinalPromptChange(e.target.value)}
          rows={4}
          placeholder="Pick an action or type above — the full prompt appears here and can be edited before you run it."
          className="nodrag resize-none text-sm leading-relaxed text-foreground placeholder:text-sm placeholder:text-muted-foreground/60"
        />
      </div>
      <Button
        onClick={onEdit}
        disabled={editing || !canEdit || !finalPrompt.trim() || estimating}
        className="flex px-14 py-4 text-sm"
      >
        {estimating ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Sparkles className="size-4" strokeWidth={1.5} />
        )}
        {editing ? "Editing…" : "Edit image"}
        {!editing && !estimating && estimatedCredits !== null && (
          <EstimatedCreditsLabel credits={estimatedCredits} />
        )}
      </Button>
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Generate an image, or connect an image reference, to edit it.
        </p>
      )}
    </div>
  );
}
