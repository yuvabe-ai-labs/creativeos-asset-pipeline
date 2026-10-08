"use client";

import { useRef, useState } from "react";
import type { AnnotationHandle } from "@/components/nodes/image-gen-annotation-canvas";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import { editModeForModel } from "@/lib/image-gen/edit-mode";
import type { ClientModelSpec } from "@/lib/image-gen/client-models";
import { compositeEditPreview } from "@/lib/composite/edit-preview";
import type { CompositeUpstreamItem } from "@/lib/composite/upstream-items";
import type { useCompositeVersions } from "./use-composite-versions";

type Generate = ReturnType<typeof useCompositeVersions>["generate"];

/** D312 — Edit on a composite: the form (instruction, chip intent, ticked references, any
 *  hand-edited brief), the paint canvas for models that take a mask (GPT Image, as in Image Gen),
 *  and the request. The form lives here, not in the section, because the one action button stays
 *  where Generate sits — below Output settings — in both modes. Strokes clear only on success. */
export function useCompositeEdit(args: {
  model: ClientModelSpec;
  values: Record<string, unknown>;
  activeVersionId: string | null;
  items: CompositeUpstreamItem[];
  hasAvatar: boolean;
  generate: Generate;
}) {
  const annotationRef = useRef<AnnotationHandle>(null);
  const [hasMaskRegion, setHasMaskRegion] = useState(false);
  const [instruction, setInstructionState] = useState("");
  const [intent, setIntent] = useState<EditIntent>("freeform");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // null = follow the template; a string = the operator's hand-edited brief.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const paintMode = editModeForModel(args.model.supportsMask) === "paint";
  const masked = paintMode && hasMaskRegion;

  const preview = compositeEditPreview({
    items: args.items,
    selectedIds,
    instruction,
    intent,
    hasAvatar: args.hasAvatar,
    masked,
  });
  const finalPrompt = promptOverride ?? preview;

  function setInstruction(v: string) {
    setInstructionState(v);
    setPromptOverride(null);
  }
  function pickChip(next: EditIntent, starter: string) {
    setIntent(next);
    setInstruction(starter);
  }
  function toggleRef(id: string) {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setPromptOverride(null);
  }

  async function runEdit() {
    if (!args.activeVersionId) return;
    const mask = paintMode && annotationRef.current?.hasMarks() ? await annotationRef.current.toMaskBase64() : null;
    const ok = await args.generate({
      instruction,
      modelId: args.model.id,
      params: args.values,
      edit: {
        baseVersionId: args.activeVersionId,
        intent,
        extraIds: selectedIds,
        ...(promptOverride !== null ? { prompt: promptOverride } : {}),
        ...(mask ? { maskBase64: mask.base64, maskMime: mask.mime } : {}),
      },
    });
    if (ok) {
      annotationRef.current?.clear();
      setHasMaskRegion(false);
    }
  }

  return {
    annotationRef,
    setHasMaskRegion,
    paintMode,
    instruction,
    setInstruction,
    intent,
    pickChip,
    selectedIds,
    toggleRef,
    finalPrompt,
    setPromptOverride,
    canRun: finalPrompt.trim().length > 0,
    runEdit,
  };
}
