"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { durationOfParams } from "@/lib/voice-change/record";
import { mentionedImageIds } from "@/lib/video-edit/prompt";
import {
  VIDEO_EDIT_DEFAULT_MODEL_ID,
  VIDEO_EDIT_MODEL_IDS,
  VIDEO_EDIT_RESOLUTIONS,
  editResolutionForTake,
  isVideoEditModelId,
  videoEditEstimateCredits,
  videoEditGate,
  videoEditLimitsFor,
  type VideoEditNodeState,
  type VideoEditResolution,
} from "@/lib/video-edit/record";
import type { UpstreamImage } from "@/lib/video-gen/api";
import { useStartVideoEdit, startErrorMessage } from "@/hooks/queries/node-generation";
import type { UpstreamNode } from "./connected-inputs-card";
import { ImageGenEditReferences } from "./image-gen-edit-references";
import { GenerateFooter } from "./generate-footer";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { VideoGenModelPicker } from "./video-gen-model-picker";
import { ParamChipGroup } from "./param-chip-group";
import type { VideoGenVersionSummary } from "./video-gen-version-history";

const PLACEHOLDER =
  "Describe what to change and where: remove the bowl… · replace the plate with the product reference… · make the light warmer…";

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  /** The active take (null if it has no finished video). */
  sourceId: string | null;
  /** The node's connected images, as the focus view already holds them (no fetch here). */
  images: UpstreamImage[];
  /** Another job (a new take, a voice change) is running on this node. */
  running: boolean;
  /** An edit of this node is running right now: the button shows it, like Edit voice's. */
  editing: boolean;
  /** D390 — why the clip can't generate, or null. */
  locked: string | null;
  value: VideoEditNodeState | undefined;
  onChange: (next: VideoEditNodeState) => void;
  /** The job was accepted. The mutation marks the node as editing; the caller pauses the video and clears the old error. */
  onStarted: () => void;
};

// D483 — Edit video, the centre column's Edit video tab (D492). The output column keeps showing
// the take being edited. The model uses the generate settings' own picker; the prompt, the
// resolution (it starts at the take's own) and the button share one card.
export function VideoGenEditVideo({ nodeId, versions, sourceId, images, running, editing, locked, value, onChange, onStarted }: Props) {
  const source = versions.find((v) => v.id === sourceId) ?? null;
  const state: VideoEditNodeState = value ?? { instruction: "", referenceNodeIds: null };
  // YUV-447 — the instruction is typed into a local draft and saved to the node on blur and on
  // submit. Binding the field straight to node data round-tripped every keystroke through the
  // canvas store, and the re-render that came back moved the caret to the end.
  const [draft, setDraft] = useState(state.instruction);
  const commitDraft = () => {
    if (draft !== state.instruction) onChange({ ...state, instruction: draft });
  };

  const modelId = isVideoEditModelId(state.modelId) ? state.modelId : VIDEO_EDIT_DEFAULT_MODEL_ID;
  const limits = videoEditLimitsFor(modelId);
  const resolution = state.resolution ?? editResolutionForTake(source?.paramsUsed?.resolution);

  // Until the operator picks, the images this take was generated with start ticked. An image
  // @-mentioned in the instruction is always ticked: it is sent whether or not its tile is.
  const usedUrls = new Set([...(source?.inputsUsed?.referenceUrls ?? []), source?.inputsUsed?.startFrameUrl].filter(Boolean));
  const ticked = new Set(state.referenceNodeIds ?? images.filter((img) => usedUrls.has(img.imageUrl)).map((img) => img.id));
  const mentioned = new Set(mentionedImageIds(draft));
  // Sent in thumbnail order, not click order.
  const selectedIds = images.filter((img) => ticked.has(img.id) || mentioned.has(img.id)).map((img) => img.id);
  const start = useStartVideoEdit(nodeId);

  const duration = durationOfParams(source?.paramsUsed ?? {});
  const credits = duration > 0 ? videoEditEstimateCredits(duration, resolution, modelId) : null;
  const gate = videoEditGate({
    sourceId,
    instruction: draft,
    durationSeconds: duration,
    referenceCount: selectedIds.length,
    modelId,
    running,
    locked,
    submitting: start.isPending,
  });
  const busy = editing || start.isPending;

  const toggle = (id: string) => {
    if (mentioned.has(id)) return; // a mentioned image stays ticked; remove the mention to drop it
    if (ticked.has(id)) return onChange({ ...state, instruction: draft, referenceNodeIds: selectedIds.filter((x) => x !== id) });
    // Further ticks are ignored once the model's reference cap is reached.
    if (selectedIds.length >= limits.maxReferences) return;
    onChange({ ...state, instruction: draft, referenceNodeIds: [...selectedIds, id] });
  };

  const submit = () => {
    if (!gate.ok || !sourceId || editing) return;
    commitDraft();
    start.mutate(
      { baseVersionId: sourceId, instruction: draft.trim(), referenceNodeIds: selectedIds, resolution, modelId },
      {
        onSuccess: onStarted,
        onError: (e) => toast.error(startErrorMessage(e, "Couldn't start the edit.")),
      },
    );
  };

  const upstream: UpstreamNode[] = images.map((img) => ({
    id: img.id,
    label: img.filename ?? "Image",
    type: img.type,
    fileUrl: img.imageUrl,
    fileKind: "image",
  }));

  return (
    <div className="flex flex-col gap-8">
      <VideoGenModelPicker
        modelId={modelId}
        onModelChange={(next) => isVideoEditModelId(next) && onChange({ ...state, instruction: draft, modelId: next })}
        offeredModelIds={VIDEO_EDIT_MODEL_IDS}
      />

      <ImageGenEditReferences
        items={images.map((img) => ({ id: img.id, label: img.filename ?? "Image", url: img.imageUrl, isBase: false }))}
        selectedIds={selectedIds}
        onToggle={toggle}
        onSetBase={() => {}}
        canSetBase={false}
      />

      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-3" onBlur={commitDraft}>
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">Edit this video</span>
          </span>
          <MentionInstructionEditor
            value={draft}
            onChange={setDraft}
            placeholder={PLACEHOLDER}
            upstream={upstream}
            disabled={Boolean(locked) || busy}
            className="nodrag min-h-32"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-eyebrow text-[0.65rem]! text-muted-foreground">Resolution</span>
          <ParamChipGroup
            options={VIDEO_EDIT_RESOLUTIONS.map((r) => ({ value: r, label: r }))}
            value={resolution}
            onValueChange={(r) => onChange({ ...state, instruction: draft, resolution: r as VideoEditResolution })}
            disabled={busy}
          />
        </div>
        {/* Generate's own button, here inside the card rather than pinned to the column. */}
        <GenerateFooter
          className="static mt-0 border-t-0 bg-transparent p-0"
          label="Edit video"
          busy={busy}
          busyLabel="Editing…"
          onClick={submit}
          disabled={busy || !gate.ok}
          disabledReason={gate.ok ? null : gate.reason}
          credits={credits}
        />
      </div>
    </div>
  );
}
