"use client";

import { AlertTriangle } from "lucide-react";

import { ImageGenOutputSettings } from "./image-gen-output-settings";
import type { ClientModelSpec } from "@/lib/image-gen/client-models";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ClientModelSpec;
  values: ParamFormValues;
  onValuesChange: (next: ParamFormValues) => void;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
  /** How many reference images are connected — drives the over-limit warning. */
  referenceCount: number;
  /** D312 — a line under the model picker (the composite says where its face can go). */
  modelNote?: string;
  /** D312 — the composite's model-chip hints and narrowed param options. */
  modelHints?: Readonly<Record<string, string>>;
  optionFilter?: Record<string, readonly string[]>;
  /** D312 — aspect ratio and resolution side by side. */
  inlineParams?: boolean;
};

/**
 * The Output-settings body — the model/param chips and the reference-limit warning. Shared
 * between the plain section on the Generate tab and the collapsible accordion on the Edit tab.
 * Generate is the column's pinned GenerateFooter (D435), not part of this section.
 */
export function ImageGenOutputSettingsBody({
  model,
  values,
  onValuesChange,
  onCommit,
  onModelChange,
  referenceCount,
  modelNote,
  modelHints,
  optionFilter,
  inlineParams,
}: Props) {
  const refOverLimit = referenceCount > model.maxReferenceImages;

  return (
    <>
      <ImageGenOutputSettings
        model={model}
        values={values}
        onValuesChange={onValuesChange}
        onCommit={onCommit}
        onModelChange={onModelChange}
        modelNote={modelNote}
        modelHints={modelHints}
        optionFilter={optionFilter}
        inlineParams={inlineParams}
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
    </>
  );
}
