"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, Clapperboard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_VIDEO_CLIENT_MODEL_ID,
  defaultsForVideoModel,
} from "@/lib/video-gen/client-models";
import { videoGenApi } from "@/lib/video-gen/api";
import { useVideoGenStatus } from "@/hooks/use-video-gen-status";
import {
  VideoGenVersionHistory,
  type VideoGenVersionSummary,
} from "./video-gen-version-history";
import { VideoGenUsagePopover } from "./video-gen-usage-popover";
import { VideoGenParamsPanel } from "./video-gen-params-panel";
import { VideoGenImageRoles } from "./video-gen-image-roles";
import type { UpstreamImage } from "@/lib/video-gen/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageRole = "start_frame" | "end_frame" | "reference";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  videoUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  imageRoles: Record<string, ImageRole>;
  onPatch: (patch: Record<string, unknown>) => void;
};

// ── Main focus view ───────────────────────────────────────────────────────────

export function VideoGenFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  videoUrl,
  modelId: modelIdProp,
  params: paramsProp,
  imageRoles: imageRolesProp,
  onPatch,
}: Props) {
  const initialModelId = modelIdProp ?? DEFAULT_VIDEO_CLIENT_MODEL_ID;

  const [modelId, setModelId] = useState(initialModelId);
  const [params, setParams] = useState<Record<string, unknown>>(
    () => paramsProp ?? defaultsForVideoModel(initialModelId),
  );
  const [imageRoles, setImageRoles] = useState<Record<string, ImageRole>>(imageRolesProp);

  const [upstreamImages, setUpstreamImages] = useState<UpstreamImage[]>([]);
  const [versions, setVersions] = useState<VideoGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const { isGenerating, lastError, setGenerating, setLastError } = useVideoGenStatus(nodeId);

  // Stable ref for onPatch — breaks the useCallback → useEffect dep cycle
  const onPatchRef = useRef(onPatch);
  useEffect(() => { onPatchRef.current = onPatch; });

  // Keep local imageRoles in sync when prop changes
  useEffect(() => { setImageRoles(imageRolesProp); }, [imageRolesProp]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchVersions = useCallback(async () => {
    try {
      const data = await videoGenApi.fetchVersions(nodeId);
      setVersions(data.versions);
      setActiveVersionId(data.activeVersionId);
      const active = data.versions.find((v) => v.id === data.activeVersionId);
      if (active?.output) onPatchRef.current({ parsed: active.output });
    } catch {
      /* best-effort */
    }
  }, [nodeId]);

  // Load data when focus view opens
  useEffect(() => {
    if (!open) return;
    fetchVersions();
    videoGenApi.fetchUpstreamImages(nodeId).then(setUpstreamImages).catch(() => {});
  }, [open, nodeId, fetchVersions]);

  // Refresh versions when a generation finishes (isGenerating transitions true → false)
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating && open) {
      fetchVersions();
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, open, fetchVersions]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleModelChange(nextModelId: string) {
    setModelId(nextModelId);
    const defaults = defaultsForVideoModel(nextModelId);
    setParams(defaults);
    onPatch({ modelId: nextModelId, params: defaults });
  }

  function handleParamChange(name: string, value: unknown) {
    const updated = { ...params, [name]: value };
    setParams(updated);
    onPatch({ params: updated });
  }

  function handleRoleChange(imageId: string, newRole: ImageRole) {
    const updated = { ...imageRoles };
    if (newRole === "start_frame" || newRole === "end_frame") {
      for (const [id, role] of Object.entries(updated)) {
        if (id !== imageId && role === newRole) updated[id] = "reference";
      }
    }
    updated[imageId] = newRole;
    setImageRoles(updated);
    onPatch({ imageRoles: updated });
  }

  async function handleGenerate() {
    setGenerating(true);
    setLastError(null);
    try {
      await videoGenApi.startGeneration(nodeId, { modelId, params, imageRoles });
      // 202 Accepted — hook's Realtime subscription clears isGenerating on completion
    } catch (e) {
      setGenerating(false);
      const msg = e instanceof Error ? e.message : "Generation failed";
      setLastError(msg);
      toast.error(msg);
    }
  }

  async function handleRestoreVersion(versionId: string) {
    setRestoring(true);
    try {
      const { output } = await videoGenApi.restoreVersion(nodeId, versionId);
      onPatch({ parsed: output });
      setActiveVersionId(versionId);
      await fetchVersions();
      toast.success("Version restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const mode: "skeleton" | "result" | "empty" = isGenerating
    ? "skeleton"
    : videoUrl
      ? "result"
      : "empty";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Video generation"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Choose a model, set params, and generate a video.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {versions.length > 0 && (
                    <VideoGenUsagePopover versions={versions} />
                  )}
                  <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
                    <Sparkles className="size-4" strokeWidth={1.5} />
                    {isGenerating ? "Generating…" : videoUrl ? "Re-generate" : "Generate"}
                  </Button>
                </div>
                {lastError && !isGenerating && (
                  <p className="text-xs text-destructive">Last attempt failed: {lastError}</p>
                )}
              </div>
            </header>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 flex justify-center overflow-hidden">
          <div className="w-full max-w-5xl flex min-h-0 overflow-hidden">
            {/* Left panel */}
            <div className="w-[40%] border-r border-border overflow-y-auto px-6 py-6 flex flex-col gap-6">
              {versions.length > 0 && (
                <VideoGenVersionHistory
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onRestore={handleRestoreVersion}
                  restoring={restoring}
                />
              )}

              <VideoGenParamsPanel
                modelId={modelId}
                params={params}
                onModelChange={handleModelChange}
                onParamChange={handleParamChange}
              />

              <VideoGenImageRoles
                images={upstreamImages}
                imageRoles={imageRoles}
                onRoleChange={handleRoleChange}
              />
            </div>

            {/* Right panel */}
            <div className="flex-1 min-h-0 flex flex-col px-6 py-6">
              <div className="flex-1 min-h-0">
                {mode === "skeleton" && (
                  <div className="size-full animate-pulse rounded-xl bg-muted-foreground/15" />
                )}
                {mode === "empty" && (
                  <div className="flex size-full items-center justify-center rounded-xl border border-dashed border-border">
                    <div className="text-center px-8">
                      <Clapperboard
                        className="mx-auto size-8 text-muted-foreground/40"
                        strokeWidth={1.5}
                      />
                      <p className="mt-3 text-sm font-medium text-muted-foreground">
                        Not generated yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Tune your params and click Generate.
                      </p>
                    </div>
                  </div>
                )}
                {mode === "result" && videoUrl && (
                  <div className="size-full overflow-hidden rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                    <video
                      src={videoUrl}
                      controls
                      className="max-h-full max-w-full rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
