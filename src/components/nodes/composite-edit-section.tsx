"use client";

import { useState } from "react";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import { compositeEditPreview } from "@/lib/composite/edit-preview";
import type { CompositeUpstreamItem } from "@/lib/composite/upstream-items";
import { ImageGenEditReferences } from "./image-gen-edit-references";
import { ImageGenEditPanel } from "./image-gen-edit-panel";

export type CompositeEditRequest = {
  instruction: string;
  intent: EditIntent;
  extraIds: string[];
  /** Only when the operator hand-edited the final prompt; otherwise the server builds it. */
  prompt?: string;
};

type Props = {
  imageUrl: string;
  items: CompositeUpstreamItem[];
  hasAvatar: boolean;
  canEdit: boolean;
  editing: boolean;
  /** The model takes a mask: the operator may paint the region on the image. */
  paintMode: boolean;
  /** A region is painted right now. */
  masked: boolean;
  estimatedCredits: (extraCount: number) => number | null;
  onEdit: (request: CompositeEditRequest) => void;
};

const BASE_ID = "__composite_base__";

// D312 — Edit on the Composite node: Image Gen's chips, references and final-prompt panel, on the
// composite's current picture. Typed for Seedream and Nano Banana; with a model that takes a mask
// (GPT Image) the region can also be painted on the image, as in Image Gen.
export function CompositeEditSection({ imageUrl, items, hasAvatar, canEdit, editing, paintMode, masked, estimatedCredits, onEdit }: Props) {
  const [instruction, setInstruction] = useState("");
  const [intent, setIntent] = useState<EditIntent>("freeform");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // null = follow the template; a string = the operator's hand-edited final prompt.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const preview = compositeEditPreview({ items, selectedIds, instruction, intent, hasAvatar, masked });
  const finalPrompt = promptOverride ?? preview;
  const references = [
    { id: BASE_ID, label: "Current picture", url: imageUrl, isBase: true },
    ...items.filter((i) => i.fileUrl).map((i) => ({ id: i.id, label: i.label, url: i.fileUrl as string, isBase: false })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {paintMode && (
        <p className="text-xs text-muted-foreground">
          Paint over the area to change on the image — only that region is edited. Leave it unpainted to edit the whole picture.
        </p>
      )}
      <ImageGenEditReferences
        items={references}
        selectedIds={selectedIds}
        onToggle={(id) => {
          setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
          setPromptOverride(null);
        }}
        onSetBase={() => {}}
        canSetBase={false}
      />
      <ImageGenEditPanel
        intent={intent}
        instruction={instruction}
        upstream={items}
        finalPrompt={finalPrompt}
        editing={editing}
        canEdit={canEdit}
        referenceWarning={(intent === "replace" || intent === "add") && selectedIds.length === 0}
        suggestGemini={false}
        onPickChip={(next, starter) => {
          setIntent(next);
          setInstruction(starter);
          setPromptOverride(null);
        }}
        onInstructionChange={(v) => {
          setInstruction(v);
          setPromptOverride(null);
        }}
        onInstructionBlur={() => {}}
        onFinalPromptChange={setPromptOverride}
        onEdit={() =>
          onEdit({
            instruction,
            intent,
            extraIds: selectedIds,
            ...(promptOverride !== null ? { prompt: promptOverride } : {}),
          })
        }
        estimatedCredits={estimatedCredits(selectedIds.length)}
        estimating={false}
      />
    </div>
  );
}
