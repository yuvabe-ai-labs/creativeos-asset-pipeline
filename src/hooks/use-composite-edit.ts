"use client";

import { useRef, useState } from "react";
import type { AnnotationHandle } from "@/components/nodes/image-gen-annotation-canvas";
import type { CompositeEditRequest } from "@/components/nodes/composite-edit-section";
import { editModeForModel } from "@/lib/image-gen/edit-mode";
import type { ClientModelSpec } from "@/lib/image-gen/client-models";
import type { useCompositeVersions } from "./use-composite-versions";

type Generate = ReturnType<typeof useCompositeVersions>["generate"];

/** D312 — Edit on a composite: the paint canvas's ref and mark state (GPT Image takes a mask, as
 *  in Image Gen), and the request that sends the current version, the references and any mask.
 *  The strokes clear only after an edit succeeds. */
export function useCompositeEdit(args: {
  model: ClientModelSpec;
  values: Record<string, unknown>;
  activeVersionId: string | null;
  generate: Generate;
}) {
  const annotationRef = useRef<AnnotationHandle>(null);
  const [hasMaskRegion, setHasMaskRegion] = useState(false);
  const paintMode = editModeForModel(args.model.supportsMask) === "paint";

  async function runEdit(req: CompositeEditRequest) {
    if (!args.activeVersionId) return;
    const mask = paintMode && annotationRef.current?.hasMarks() ? await annotationRef.current.toMaskBase64() : null;
    const ok = await args.generate({
      instruction: req.instruction,
      modelId: args.model.id,
      params: args.values,
      edit: {
        baseVersionId: args.activeVersionId,
        intent: req.intent,
        extraIds: req.extraIds,
        prompt: req.prompt,
        ...(mask ? { maskBase64: mask.base64, maskMime: mask.mime } : {}),
      },
    });
    if (ok) {
      annotationRef.current?.clear();
      setHasMaskRegion(false);
    }
  }

  return { annotationRef, hasMaskRegion, setHasMaskRegion, paintMode, runEdit };
}
