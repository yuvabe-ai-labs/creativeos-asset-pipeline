"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Combine, History, Settings2, Type } from "lucide-react";
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
  COMPOSITE_MODEL_LOCK_REASON,
  compositeModelLock,
  resolveCompositeModelId,
} from "@/lib/composite/model";
import { compositeMentionUpstream, compositeMentionables } from "@/lib/composite/upstream-items";
import { useCompositeUpstream } from "@/hooks/use-composite-upstream";
import { useCompositeVersions } from "@/hooks/use-composite-versions";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { NodeIcon } from "./connected-inputs-card";
import { AddConnection } from "./add-connection";
import { LeftSection } from "./focus-left-section";
import { RailItem } from "./focus-rail-item";
import { FieldLabel } from "./field-label";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { ImageGenOutputSettingsBody } from "./image-gen-output-settings-body";
import { ImageGenVersionHistory } from "./image-gen-version-history";
import { CompositeOutputPane } from "./composite-output-pane";
import { useRailDisconnect } from "./use-rail-disconnect";

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

// D309 — the Composite node's focus view: Image Gen's shell and headings, minus the prompt lane.
// Rail: Composite (compose here), the wired inputs, History. Middle: the instruction and output
// settings. Right: the image, always visible.
export function CompositeFocusView({ open, onOpenChange, nodeId, title, imageUrl, instruction, modelId, params, onPatch }: Props) {
  const editable = useCanvasEditable();
  const upstream = useCompositeUpstream(nodeId);
  const mentionUpstream = useMemo(() => compositeMentionUpstream(upstream), [upstream]);
  const hasAvatar = upstream.some((u) => u.type === "avatar");
  const lock = compositeModelLock(hasAvatar);
  // A stored id the client map no longer lists (a retired model) falls back to the default.
  const model =
    imageGenClientModelMap[resolveCompositeModelId(modelId, hasAvatar)] ??
    imageGenClientModelMap[COMPOSITE_DEFAULT_MODEL_ID];
  const [draft, setDraft] = useState(instruction);
  const [selected, setSelected] = useState<"compose" | "history">("compose");
  const values = useMemo(
    () => smartMergeParams({ ...defaultsForModel(model), ...(params ?? {}) }, model),
    [model, params],
  );
  const { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore } =
    useCompositeVersions(nodeId, open, onPatch);
  const { removeFor } = useRailDisconnect(nodeId, () => {});

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
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem icon={<Combine className="size-4 text-primary" strokeWidth={1.5} />} label="Composite" active={selected === "compose"} onClick={() => setSelected("compose")} />
            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-eyebrow">Connected · {upstream.length}</span>
              <AddConnection targetId={nodeId} targetType="composite" connectedIds={upstream.map((u) => u.id)} />
            </div>
            {upstream.length === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">Nothing wired — describe the whole picture.</p>
            ) : (
              upstream.map((u) => {
                const remove = editable ? removeFor(u.id, u.label) : null;
                return (
                  <RailItem key={u.id} icon={<NodeIcon type={u.type} />} label={u.label} active={false} onClick={() => setSelected("compose")} onRemove={remove?.onClick} removeLabel={remove?.label} removeKind={remove?.kind} />
                );
              })
            )}
            <div className="mx-2.5 my-2 h-px bg-border" />
            <RailItem icon={<History className="size-4 text-primary" strokeWidth={1.5} />} label="History" active={selected === "history"} onClick={() => setSelected("history")} badge={versions.length ? <span className="text-xs text-muted-foreground">{versions.length}</span> : undefined} />
          </nav>

          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {selected === "compose" ? (
                <div className="flex flex-col gap-6 px-6 py-5">
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
                  <LeftSection icon={Settings2} label="Output settings">
                    <ImageGenOutputSettingsBody
                      model={model}
                      values={values}
                      onValuesChange={(next) => onPatch({ params: next })}
                      onCommit={(next) => onPatch({ params: next })}
                      onModelChange={(id) => onPatch({ modelId: id })}
                      modelLock={lock ? { reason: COMPOSITE_MODEL_LOCK_REASON } : undefined}
                      missingInputReason="Say what to make first."
                      referenceCount={referenceUrls.length}
                      refValidation={refValidation}
                      showGenerate
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
            <CompositeOutputPane imageUrl={imageUrl} generating={generating} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
