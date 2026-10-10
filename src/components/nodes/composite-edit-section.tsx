"use client";

import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import type { CompositeUpstreamItem } from "@/lib/composite/upstream-items";
import { ImageGenEditReferences } from "./image-gen-edit-references";
import { ImageGenEditPanel } from "./image-gen-edit-panel";

type Props = {
  imageUrl: string;
  items: CompositeUpstreamItem[];
  paintMode: boolean;
  editing: boolean;
  canEdit: boolean;
  instruction: string;
  onInstructionChange: (v: string) => void;
  intent: EditIntent;
  onPickChip: (intent: EditIntent, starter: string) => void;
  selectedIds: string[];
  onToggleRef: (id: string) => void;
  finalPrompt: string;
  onFinalPromptChange: (v: string) => void;
};

const BASE_ID = "__composite_base__";

// D312 — Edit on the Composite node: Image Gen's chips, references and final-prompt panel, in the
// instruction's place. Its action is the focus view's one button, below Output settings, so the
// page keeps the same order in both modes. Typed for Seedream and Nano Banana; with GPT Image the
// region can also be painted on the image, as in Image Gen.
export function CompositeEditSection(props: Props) {
  const references = [
    { id: BASE_ID, label: "Current picture", url: props.imageUrl, isBase: true },
    ...props.items
      .filter((i) => i.fileUrl)
      .map((i) => ({ id: i.id, label: i.label, url: i.fileUrl as string, isBase: false })),
  ];
  return (
    <div className="flex flex-col gap-4">
      {props.paintMode && (
        <p className="text-xs text-muted-foreground">
          Paint over the area to change on the image — only that region is edited. Leave it unpainted to edit the whole picture.
        </p>
      )}
      <ImageGenEditReferences
        items={references}
        selectedIds={props.selectedIds}
        onToggle={props.onToggleRef}
        onSetBase={() => {}}
        canSetBase={false}
      />
      <ImageGenEditPanel
        intent={props.intent}
        instruction={props.instruction}
        upstream={props.items}
        finalPrompt={props.finalPrompt}
        editing={props.editing}
        canEdit={props.canEdit}
        referenceWarning={(props.intent === "replace" || props.intent === "add") && props.selectedIds.length === 0}
        suggestGemini={false}
        onPickChip={props.onPickChip}
        onInstructionChange={props.onInstructionChange}
        onInstructionBlur={() => {}}
        onFinalPromptChange={props.onFinalPromptChange}
        onEdit={() => {}}
        estimatedCredits={null}
        estimating={false}
        showAction={false}
      />
    </div>
  );
}
