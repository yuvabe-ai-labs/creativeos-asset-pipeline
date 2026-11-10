"use client";

import { toast } from "sonner";
import { Sparkles, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { durationOfParams } from "@/lib/voice-change/record";
import {
  VIDEO_EDIT_DEFAULT_MODEL_ID,
  VIDEO_EDIT_DEFAULT_RESOLUTION,
  VIDEO_EDIT_LIMITS_NOTE,
  VIDEO_EDIT_MODEL_IDS,
  VIDEO_EDIT_RESOLUTIONS,
  isVideoEditModelId,
  videoEditEstimateCredits,
  videoEditGate,
  videoEditLimitsFor,
  type VideoEditNodeState,
  type VideoEditResolution,
} from "@/lib/video-edit/record";
import type { UpstreamImage } from "@/lib/video-gen/api";
import { useStartVideoEdit, startErrorMessage } from "@/hooks/queries/node-generation";
import { ImageGenEditReferences } from "./image-gen-edit-references";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { VideoGenModelPicker } from "./video-gen-model-picker";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";
import type { VideoGenVersionSummary } from "./video-gen-version-history";

const PLACEHOLDER =
  "Describe what to change and where: remove the cups… · replace the pot with the product reference… · make the light warmer…";

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  /** The active take (null if it has no finished video). */
  sourceId: string | null;
  /** The node's connected images, as the focus view already holds them (no fetch here). */
  images: UpstreamImage[];
  /** Another job (a new take, a voice change) is running on this node. */
  running: boolean;
  /** An edit of this node is running right now: the button shows it, like Edit voice's Apply. */
  editing: boolean;
  /** D390 — why the clip can't generate, or null. */
  locked: string | null;
  value: VideoEditNodeState | undefined;
  onChange: (next: VideoEditNodeState) => void;
  /** The job was accepted. The mutation marks the node as editing; the caller pauses the video and clears the old error. */
  onStarted: () => void;
};

// D483 — Edit, in the focus view's centre column (where Edit voice sits). The output column keeps
// showing the take being edited. The model and resolution use the generate settings' own controls.
export function VideoGenEditVideo({ nodeId, versions, sourceId, images, running, editing, locked, value, onChange, onStarted }: Props) {
  const source = versions.find((v) => v.id === sourceId) ?? null;
  // Until the operator picks, the images this take was generated with start checked.
  const usedUrls = new Set([...(source?.inputsUsed?.referenceUrls ?? []), source?.inputsUsed?.startFrameUrl].filter(Boolean));
  const state: VideoEditNodeState = value ?? {
    instruction: "",
    referenceNodeIds: null,
    resolution: VIDEO_EDIT_DEFAULT_RESOLUTION,
  };
  const modelId = isVideoEditModelId(state.modelId) ? state.modelId : VIDEO_EDIT_DEFAULT_MODEL_ID;
  const limits = videoEditLimitsFor(modelId);
  const selectedSet = new Set(state.referenceNodeIds ?? images.filter((img) => usedUrls.has(img.imageUrl)).map((img) => img.id));
  // Sent in thumbnail order, not click order.
  const selectedIds = images.filter((img) => selectedSet.has(img.id)).map((img) => img.id);
  const start = useStartVideoEdit(nodeId);

  const duration = durationOfParams(source?.paramsUsed ?? {});
  const credits = duration > 0 ? videoEditEstimateCredits(duration, state.resolution, modelId) : null;
  const gate = videoEditGate({
    sourceId,
    instruction: state.instruction,
    durationSeconds: duration,
    referenceCount: selectedIds.length,
    modelId,
    running,
    locked,
    submitting: start.isPending,
  });
  const busy = editing || start.isPending;

  const toggle = (id: string) => {
    if (selectedSet.has(id)) return onChange({ ...state, referenceNodeIds: selectedIds.filter((x) => x !== id) });
    // Further ticks are ignored once the model's reference cap is reached.
    if (selectedIds.length >= limits.maxReferences) return;
    onChange({ ...state, referenceNodeIds: [...selectedIds, id] });
  };

  const submit = () => {
    if (!gate.ok || !sourceId || editing) return;
    start.mutate(
      { baseVersionId: sourceId, instruction: state.instruction.trim(), referenceNodeIds: selectedIds, resolution: state.resolution, modelId },
      {
        onSuccess: onStarted,
        onError: (e) => toast.error(startErrorMessage(e, "Couldn't start the edit.")),
      },
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <VideoGenModelPicker
        modelId={modelId}
        onModelChange={(next) => isVideoEditModelId(next) && onChange({ ...state, modelId: next })}
        offeredModelIds={VIDEO_EDIT_MODEL_IDS}
      >
        <div className="space-y-3">
          <FieldLabel icon={Settings2} label="Resolution" />
          <ParamChipGroup
            options={VIDEO_EDIT_RESOLUTIONS.map((r) => ({ value: r, label: r }))}
            value={state.resolution}
            onValueChange={(r) => onChange({ ...state, resolution: r as VideoEditResolution })}
            disabled={busy}
          />
        </div>
      </VideoGenModelPicker>

      <ImageGenEditReferences
        items={images.map((img) => ({ id: img.id, label: img.filename ?? "Image", url: img.imageUrl, isBase: false }))}
        selectedIds={selectedIds}
        onToggle={toggle}
        onSetBase={() => {}}
        canSetBase={false}
      />

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Edit this video</span>
        </div>
        <Textarea
          value={state.instruction}
          onChange={(e) => onChange({ ...state, instruction: e.target.value })}
          placeholder={PLACEHOLDER}
          rows={5}
          disabled={Boolean(locked) || busy}
          className="nodrag resize-none"
        />
        <p className="text-xs text-muted-foreground">{VIDEO_EDIT_LIMITS_NOTE}</p>
        <Button className="w-full" disabled={busy || !gate.ok} onClick={submit} title={gate.ok || busy ? undefined : gate.reason}>
          {busy ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : <Sparkles className="size-4" strokeWidth={1.5} />}
          {busy ? "Editing…" : "Edit video"}
          {!busy && credits !== null && <EstimatedCreditsLabel credits={credits} />}
        </Button>
        {!busy && !gate.ok && <p className="text-xs text-muted-foreground">{gate.reason}</p>}
      </div>
    </div>
  );
}
