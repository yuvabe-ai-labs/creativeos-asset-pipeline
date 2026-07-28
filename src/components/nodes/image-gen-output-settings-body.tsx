"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { ImageGenOutputSettings } from "./image-gen-output-settings";
import type { ClientModelSpec } from "@/lib/image-gen/client-models";
import type { ValidationResult } from "@/lib/image-gen/validate";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ClientModelSpec;
  values: ParamFormValues;
  onValuesChange: (next: ParamFormValues) => void;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
  /** How many reference images are connected — drives the over-limit warning. */
  referenceCount: number;
  refValidation: ValidationResult;
  /** The Edit tab has its own action button, so it hides this one. */
  showGenerate: boolean;
  onGenerate: () => void;
  generating: boolean;
  editing: boolean;
  /** A prompt node must be connected before generation is possible. */
  hasPrompt: boolean;
  /** An existing attempt turns "Generate" into "Re-generate". */
  hasImage: boolean;
  /** Pre-generation credit estimate — null while unavailable/still computing. */
  estimatedCredits: number | null;
  estimating: boolean;
};

/**
 * The Output-settings body — the model/param chips, the reference-limit warning,
 * and (Generate tab only) the Generate button. Shared between the plain section
 * on the Generate tab and the collapsible accordion on the Edit tab.
 */
export function ImageGenOutputSettingsBody({
  model,
  values,
  onValuesChange,
  onCommit,
  onModelChange,
  referenceCount,
  refValidation,
  showGenerate,
  onGenerate,
  generating,
  editing,
  hasPrompt,
  hasImage,
  estimatedCredits,
  estimating,
}: Props) {
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const refOverLimit = referenceCount > model.maxReferenceImages;

  // One derived reason drives both the Generate button's disabled state and its
  // tooltip — the button is never disabled without an explanation, and the two
  // can't drift apart. `estimating` disables the button too (below), but deliberately has
  // no entry here — the spinning Loader2 icon on the button is the indicator for that case,
  // not a tooltip message.
  const generateDisabledReason: string | null = generating
    ? "A generation is already running."
    : editing
      ? "An edit is already running."
      : !editable
        ? "Another session is editing — this canvas is read-only."
        : !hasPrompt
          ? "Connect a Prompt node to generate."
          : !refValidation.ok
            ? refValidation.violations.length === 1
              ? "A reference image doesn't meet this model's requirements. Try resizing it or switching to a different model."
              : `${refValidation.violations.length} reference images don't meet this model's requirements. Try resizing them or switching to a different model.`
            : null;

  return (
    <>
      <ImageGenOutputSettings
        model={model}
        values={values}
        onValuesChange={onValuesChange}
        onCommit={onCommit}
        onModelChange={onModelChange}
      />
      {refOverLimit && (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[0.7rem] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          <span>
            {referenceCount} reference images connected — only the first{" "}
            {model.maxReferenceImages} will be used by {model.label}.
          </span>
        </div>
      )}
      {showGenerate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="mt-5 inline-flex w-fit" />}
            >
              <Button
                className="px-14 py-4 text-sm"
                size="default"
                onClick={onGenerate}
                disabled={Boolean(generateDisabledReason) || estimating}
              >
                {estimating ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Sparkles className="size-4" strokeWidth={1.5} />
                )}
                {generating
                  ? "Generating…"
                  : editing
                  ? "Editing…"
                  : hasImage
                  ? "Re-generate"
                  : "Generate"}
                {!generateDisabledReason && !estimating && estimatedCredits !== null && ` · ${estimatedCredits}`}
              </Button>
            </TooltipTrigger>
            {generateDisabledReason && (
              <TooltipContent side="top" className="max-w-56 text-center">
                {generateDisabledReason}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
}
