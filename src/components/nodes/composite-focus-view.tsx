"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Settings2, Type } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { normalizeTitle } from "@/lib/nodes/title";
import { imageGenClientModelMap, defaultsForModel } from "@/lib/image-gen/client-models";
import { smartMergeParams } from "@/lib/image-gen/params/merge";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { validateReferenceImages } from "@/lib/image-gen/validate";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  COMPOSITE_DEFAULT_MODEL_ID,
  compositeModelNote,
  resolveCompositeModelId,
} from "@/lib/composite/model";
import { compositeMentionUpstream, compositeMentionables } from "@/lib/composite/upstream-items";
import { useCompositeUpstream } from "@/hooks/use-composite-upstream";
import { useCompositeVersions } from "@/hooks/use-composite-versions";
import { CompositeEditSection } from "./composite-edit-section";
import { useCompositeEdit } from "@/hooks/use-composite-edit";
import { CompositeFocusRail } from "./composite-focus-rail";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { LeftSection } from "./focus-left-section";
import { FieldLabel } from "./field-label";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { ImageGenOutputSettingsBody } from "./image-gen-output-settings-body";
import { ImageGenVersionHistory } from "./image-gen-version-history";
import { CompositeOutputPane } from "./composite-output-pane";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  imageUrl: string | null;
  instruction: string;
  modelId?: string;
  params?: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
};

// D312 — the Composite node's focus view: Image Gen's shell and headings, minus the prompt lane.
// Rail: Composite (compose here), the wired inputs, History. Middle: the instruction and output
// settings. Right: the image, always visible.
export function CompositeFocusView({ open, onOpenChange, nodeId, title, imageUrl, instruction, modelId, params, onPatch }: Props) {
  const editable = useCanvasEditable();
  const upstream = useCompositeUpstream(nodeId);
  const mentionUpstream = useMemo(() => compositeMentionUpstream(upstream), [upstream]);
  const hasAvatar = upstream.some((u) => u.type === "avatar");
  // A stored id the client map no longer lists (a retired model) falls back to the default.
  const model =
    imageGenClientModelMap[resolveCompositeModelId(modelId)] ??
    imageGenClientModelMap[COMPOSITE_DEFAULT_MODEL_ID];
  const modelNote = compositeModelNote(model.id, hasAvatar);
  const [draft, setDraft] = useState(instruction);
  const [selected, setSelected] = useState<"compose" | "history">("compose");
  // D312 — Edit acts on the current picture, so it exists only once there is one.
  const [editMode, setEditMode] = useState(false);
  const values = useMemo(
    () => smartMergeParams({ ...defaultsForModel(model), ...(params ?? {}) }, model),
    [model, params],
  );
  const { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore } =
    useCompositeVersions(nodeId, open, onPatch);

  // The same images the server will send: an avatar's front and fresh sheet are two.
  const referenceUrls = mentionUpstream.flatMap((u) => (u.fileUrl ? [u.fileUrl] : []));
  const costUsd = estimateImageGenerationCostUsd({
    modelId: model.id,
    quality: values.quality as string | undefined,
    aspectRatio: values.aspect_ratio as string | undefined,
    imageSize: values.image_size as string | undefined,
    referenceUrls,
  });
  const refValidation = validateReferenceImages(referenceUrls.map((url) => ({ url })), model);
  const canEditPicture = Boolean(imageUrl && activeVersionId);
  const editing = editMode && canEditPicture;
  const { annotationRef, hasMaskRegion, setHasMaskRegion, paintMode, runEdit } = useCompositeEdit({
    model,
    values,
    activeVersionId,
    generate,
  });
  // An edit sends the current picture plus the references it uses.
  const editCredits = (extraCount: number) => {
    const usd = estimateImageGenerationCostUsd({
      modelId: model.id,
      quality: values.quality as string | undefined,
      aspectRatio: values.aspect_ratio as string | undefined,
      imageSize: values.image_size as string | undefined,
      referenceUrls: Array.from({ length: 1 + extraCount }, (_, i) => `ref-${i}`),
    });
    return usd === null ? null : usdToFinalCredits(usd);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]">
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <SheetTitle className="mt-4 p-0 font-display text-3xl font-semibold tracking-tight">
              <EditableField value={title} onCommit={(t) => onPatch({ title: normalizeTitle(t) })} placeholder="Composite" className="font-display text-3xl font-semibold tracking-tight" />
            </SheetTitle>
            {lastError && !generating && <div className="mt-2"><GenerationErrorBadge error={lastError} /></div>}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          <CompositeFocusRail
            nodeId={nodeId}
            upstream={upstream}
            selected={selected}
            onSelect={setSelected}
            versionCount={versions.length}
          />

          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {selected === "compose" ? (
                <div className="flex flex-col gap-6 px-6 py-5">
                  {editing && imageUrl && activeVersionId ? (
                    <CompositeEditSection
                      imageUrl={imageUrl}
                      items={mentionUpstream}
                      hasAvatar={hasAvatar}
                      canEdit={editable}
                      editing={generating}
                      estimatedCredits={editCredits}
                      paintMode={paintMode}
                      masked={paintMode && hasMaskRegion}
                      onEdit={(req) => void runEdit(req)}
                    />
                  ) : (
                  <div className="flex flex-col gap-2">
                    <FieldLabel icon={Type} label="Instruction" />
                    <MentionInstructionEditor
                      value={draft}
                      onChange={(v) => { setDraft(v); onPatch({ instruction: v }); }}
                      placeholder="e.g. @Riya at her desk holding @Sandals, in a bright open-plan office. A 2×2 sheet, four angles, warm window light."
                      upstream={mentionUpstream}
                      mentionables={compositeMentionables(mentionUpstream)}
                      disabled={!editable || generating}
                      className="min-h-24"
                    />
                    <p className="text-[0.65rem] text-muted-foreground">Type @ to use a connected input. Nothing has to be connected — a background can be words alone.</p>
                  </div>
                  )}
                  <LeftSection icon={Settings2} label="Output settings">
                    <ImageGenOutputSettingsBody
                      model={model}
                      values={values}
                      onValuesChange={(next) => onPatch({ params: next })}
                      onCommit={(next) => onPatch({ params: next })}
                      onModelChange={(id) => onPatch({ modelId: id })}
                      modelNote={modelNote ?? undefined}
                      missingInputReason="Say what to make first."
                      referenceCount={referenceUrls.length}
                      refValidation={refValidation}
                      showGenerate={!editing}
                      onGenerate={() => void generate({ instruction: draft, modelId: model.id, params: values })}
                      generating={generating}
                      editing={false}
                      hasPrompt={draft.trim().length > 0}
                      hasImage={Boolean(imageUrl)}
                      estimatedCredits={costUsd === null ? null : usdToFinalCredits(costUsd)}
                      estimating={false}
                    />
                  </LeftSection>
                </div>
              ) : (
                <div className="px-6 py-5">
                  {loading ? (
                    <Skeleton className="h-24 w-full rounded-xl" />
                  ) : versions.length ? (
                    <ImageGenVersionHistory versions={versions} activeVersionId={activeVersionId} onRestore={(id) => void restore(id)} restoring={restoring} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No composites yet — every attempt will show up here.</p>
                  )}
                </div>
              )}
            </div>
            <CompositeOutputPane
              nodeId={nodeId}
              imageUrl={imageUrl}
              generating={generating}
              canEdit={canEditPicture}
              editMode={editMode}
              painting={editing && paintMode}
              paintRef={annotationRef}
              paintKey={`${imageUrl}:${model.id}`}
              onMarksChange={setHasMaskRegion}
              onEditModeChange={(next) => {
                setEditMode(next);
                setSelected("compose"); // the mode's controls live in the middle column
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
