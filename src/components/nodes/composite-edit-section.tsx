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
  estimatedCredits: (extraCount: number) => number | null;
  onEdit: (request: CompositeEditRequest) => void;
};

const BASE_ID = "__composite_base__";

// D312 — Edit on the Composite node: Image Gen's chips, references and final-prompt panel, on the
// composite's current picture. Typed edits only — Seedream and Nano Banana take no mask.
export function CompositeEditSection({ imageUrl, items, hasAvatar, canEdit, editing, estimatedCredits, onEdit }: Props) {
  const [instruction, setInstruction] = useState("");
  const [intent, setIntent] = useState<EditIntent>("freeform");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // null = follow the template; a string = the operator's hand-edited final prompt.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const preview = compositeEditPreview({ items, selectedIds, instruction, intent, hasAvatar });
  const finalPrompt = promptOverride ?? preview;
  const references = [
    { id: BASE_ID, label: "Current picture", url: imageUrl, isBase: true },
    ...items.filter((i) => i.fileUrl).map((i) => ({ id: i.id, label: i.label, url: i.fileUrl as string, isBase: false })),
  ];

  return (
    <div className="flex flex-col gap-4">
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
