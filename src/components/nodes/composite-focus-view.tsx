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
  COMPOSITE_ASPECT_RATIOS,
  COMPOSITE_MODEL_HINTS,
  clampCompositeParams,
  compositeModelNote,
  compositePickerModelId,
} from "@/lib/composite/model";
import { compositeMentionUpstream, compositeMentionables, compositePreviewOf } from "@/lib/composite/upstream-items";
import { ConnectedDetailView } from "./connected-inputs-card";
import type { CompositeRailSelection } from "./composite-focus-rail";
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
import { useVersionViewing } from "@/hooks/use-version-viewing";
import { VersionViewingBar } from "./version-viewing-bar";
import { VersionStepper } from "./version-stepper";
import { ActiveOnlyNotice } from "./active-only-notice";
import { versionLabelsById } from "@/lib/generations/version-labels";
import { ImageGenUsagePopover } from "./image-gen-usage-popover";
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
  const upstreamNodeIds = useMemo(() => upstream.map((u) => u.id), [upstream]);
  // A stored id the client map no longer lists (a retired model) falls back to the default.
  const model = imageGenClientModelMap[compositePickerModelId(modelId)];
  const modelNote = compositeModelNote(model.id, hasAvatar);
  const [draft, setDraft] = useState(instruction);
  const [selected, setSelected] = useState<CompositeRailSelection>("compose");
  // A wired input picked in the rail: its read-only preview takes the middle column.
  const previewItem = upstream.find((u) => u.id === selected);
  // D312 — Edit acts on the current picture, so it exists only once there is one.
  const [editMode, setEditMode] = useState(false);
  const values = useMemo(
    () => clampCompositeParams(smartMergeParams({ ...defaultsForModel(model), ...(params ?? {}) }, model)),
    [model, params],
  );
  const { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore } =
    useCompositeVersions(nodeId, open, onPatch);
  // D383 — the version on screen. Leaving the active one ends Edit, which acts on it.
  const viewing = useVersionViewing(versions, activeVersionId, open, () => setEditMode(false));
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  const viewedLabel = viewed ? labelById.get(viewed.id) ?? "" : "";
  const shownImageUrl = viewing.isViewingOther ? viewed?.output ?? null : imageUrl;

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
  const canEditPicture = Boolean(imageUrl && activeVersionId) && !viewing.isViewingOther;
  const editing = editMode && canEditPicture;
  const edit = useCompositeEdit({ model, values, activeVersionId, items: mentionUpstream, hasAvatar, generate });
  // An edit sends the current picture plus the references it uses.
  const editUsd = estimateImageGenerationCostUsd({
    modelId: model.id,
    quality: values.quality as string | undefined,
    aspectRatio: values.aspect_ratio as string | undefined,
    imageSize: values.image_size as string | undefined,
    referenceUrls: Array.from({ length: 1 + edit.selectedIds.length }, (_, i) => `ref-${i}`),
  });
  const actionUsd = editing ? editUsd : costUsd;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]">
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                <EditableField value={title} onCommit={(t) => onPatch({ title: normalizeTitle(t) })} placeholder="Composite" className="font-display text-3xl font-semibold tracking-tight" />
              </SheetTitle>
              {/* Per-version credits; a skeleton holds its place until the versions load. */}
              {loading ? (
                <Skeleton className="h-8 w-28 shrink-0 rounded-lg" />
              ) : (
                <ImageGenUsagePopover versions={versions} nodeId={nodeId} upstreamNodeIds={upstreamNodeIds} />
              )}
            </header>
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
              {previewItem ? (
                <ConnectedDetailView node={compositePreviewOf(previewItem)} />
              ) : selected !== "history" ? (
                <div className="flex flex-col gap-6 px-6 py-5">
                  {viewing.isViewingOther && <ActiveOnlyNotice label={viewedLabel} />}
                  {editing && imageUrl && activeVersionId ? (
                    <CompositeEditSection
                      imageUrl={imageUrl}
                      items={mentionUpstream}
                      paintMode={edit.paintMode}
                      editing={generating}
                      canEdit={editable}
                      instruction={edit.instruction}
                      onInstructionChange={edit.setInstruction}
                      intent={edit.intent}
                      onPickChip={edit.pickChip}
                      selectedIds={edit.selectedIds}
                      onToggleRef={edit.toggleRef}
                      finalPrompt={edit.finalPrompt}
                      onFinalPromptChange={edit.setPromptOverride}
                    />
                  ) : (
                  <div className="flex flex-col gap-2">
                    <FieldLabel icon={Type} label="Instruction" />
                    <MentionInstructionEditor
                      value={draft}
                      onChange={(v) => { setDraft(v); onPatch({ instruction: v }); }}
                      placeholder="e.g. @Riya at her desk holding @Sandals, in a bright open-plan office, for @Shot 2. Wire a Script or Multishot node to mention its shots."
                      upstream={mentionUpstream}
                      mentionables={compositeMentionables(mentionUpstream, upstream)}
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
                      modelHints={COMPOSITE_MODEL_HINTS}
                      optionFilter={{ aspect_ratio: COMPOSITE_ASPECT_RATIOS }}
                      inlineParams
                      actionLabel={editing ? { idle: "Edit image", busy: "Editing…" } : undefined}
                      missingInputReason={editing ? "Describe the edit first." : "Say what to make first."}
                      referenceCount={referenceUrls.length}
                      refValidation={refValidation}
                      showGenerate
                      onGenerate={() =>
                        void (editing ? edit.runEdit() : generate({ instruction: draft, modelId: model.id, params: values }))
                      }
                      generating={generating || viewing.isViewingOther}
                      editing={false}
                      hasPrompt={editing ? edit.canRun : draft.trim().length > 0}
                      hasImage={Boolean(imageUrl)}
                      estimatedCredits={actionUsd === null ? null : usdToFinalCredits(actionUsd)}
                      estimating={false}
                    />
                  </LeftSection>
                </div>
              ) : (
                <div className="px-6 py-5">
                  {loading ? (
                    <Skeleton className="h-24 w-full rounded-xl" />
                  ) : versions.length ? (
                    <ImageGenVersionHistory versions={versions} activeVersionId={activeVersionId} viewedVersionId={viewed?.id ?? null} onView={viewing.view} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No composites yet — every attempt will show up here.</p>
                  )}
                </div>
              )}
            </div>
            <CompositeOutputPane
              nodeId={nodeId}
              imageUrl={shownImageUrl}
              generating={generating}
              canEdit={canEditPicture}
              editMode={editMode}
              painting={editing && edit.paintMode}
              paintRef={edit.annotationRef}
              paintKey={`${imageUrl}:${model.id}`}
              onMarksChange={edit.setHasMaskRegion}
              onEditModeChange={(next) => {
                setEditMode(next);
                setSelected("compose"); // the mode's controls live in the middle column
              }}
              stepper={loading ? null : <VersionStepper index={viewing.index} total={viewing.total} onStep={viewing.step} />}
              banner={
                viewing.isViewingOther && viewed ? (
                  <VersionViewingBar
                    viewedLabel={viewedLabel}
                    viewedCreatedAt={viewed.createdAt}
                    activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
                    canRestore={editable && !viewed.error && Boolean(viewed.output)}
                    restoring={restoring}
                    onBack={viewing.backToActive}
                    onRestore={() => void restore(viewed.id)}
                  />
                ) : null
              }
              viewingFailed={viewing.isViewingOther && !viewed?.output}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
