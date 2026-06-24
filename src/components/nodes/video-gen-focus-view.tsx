"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Clapperboard,
  History,
  Link2,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_VIDEO_CLIENT_MODEL_ID,
  defaultsForVideoModel,
  videoGenClientModelMap,
} from "@/lib/video-gen/client-models";
import { videoGenApi } from "@/lib/video-gen/api";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useVideoGenStatus } from "@/hooks/use-video-gen-status";
import {
  VideoGenVersionHistory,
  type VideoGenVersionSummary,
} from "./video-gen-version-history";
import { VideoGenUsagePopover } from "./video-gen-usage-popover";
import { VideoGenParamsPanel } from "./video-gen-params-panel";
import { VideoGenConnectedSection } from "./video-gen-connected-section";
import type { UpstreamImage, UpstreamPromptNode } from "@/lib/video-gen/api";

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

// ── Section header (matches image-gen-focus-view.tsx LeftSection pattern) ─────

function LeftSection({
  icon: Icon,
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        aria-expanded={onToggle ? open : undefined}
        className={cn(
          "mb-2 flex w-full items-center justify-between text-left",
          onToggle && "cursor-pointer select-none",
        )}
        onClick={onToggle}
        onKeyDown={
          onToggle
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs text-muted-foreground">{badge}</span>
          )}
          {onToggle !== undefined && (
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ActiveVersionRow({
  versions,
  activeVersionId,
}: {
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
}) {
  const row = activeVersionId
    ? (versions.find((v) => v.id === activeVersionId) ?? versions[0])
    : versions[0];
  if (!row) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      {row.output && (
        <video
          src={row.output}
          className="size-7 shrink-0 rounded object-cover"
          muted
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground">
          {row.modelUsed ?? "Unknown model"}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          {relativeTime(row.createdAt)}
        </p>
      </div>
      {row.id === activeVersionId && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
          Active
        </span>
      )}
    </div>
  );
}

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
  const [upstreamImages, setUpstreamImages] = useState<UpstreamImage[]>([]);
  const [promptNode, setPromptNode] = useState<UpstreamPromptNode | null>(null);
  const [versions, setVersions] = useState<VideoGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [useMock, setUseMock] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("video-gen-mock") !== "false";
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [connectedOpen, setConnectedOpen] = useState(true);

  const { isGenerating, lastError, setGenerating, setLastError } = useVideoGenStatus(nodeId);

  // Stable Zustand actions — used directly in effects so deps don't include
  // the per-render wrapper functions returned by useVideoGenStatus.
  const setVideoGenGenerating = useCanvasStore((s) => s.setVideoGenGenerating);
  const setVideoGenError = useCanvasStore((s) => s.setVideoGenError);

  // Stable ref for onPatch — breaks the useCallback → useEffect dep cycle
  const onPatchRef = useRef(onPatch);
  useEffect(() => { onPatchRef.current = onPatch; });

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

  // Load data when focus view opens; also re-check generation status to clear
  // any stale isGenerating=true that may have been set while the sheet was closed.
  // setState calls happen inside .then() callbacks, not synchronously in the effect body.
  useEffect(() => {
    if (!open) return;
    createBrowserSupabase()
      .from("generations")
      .select("id, status, error")
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { status: string; error: string | null } | null;
        if (!row) return;
        if (row.status === "succeeded" || row.status === "failed") {
          setVideoGenGenerating(nodeId, false);
          setVideoGenError(nodeId, row.status === "failed" ? (row.error ?? "Generation failed") : null);
        }
      });
    videoGenApi.fetchVersions(nodeId).then((data) => {
      setVersions(data.versions);
      setActiveVersionId(data.activeVersionId);
      const active = data.versions.find((v) => v.id === data.activeVersionId);
      if (active?.output) onPatchRef.current({ parsed: active.output });
    }).catch(() => {});
    videoGenApi.fetchUpstreamImages(nodeId).then(({ images, promptNode: pn }) => {
      setUpstreamImages(images);
      setPromptNode(pn);
    }).catch(() => {});
  }, [open, nodeId, setVideoGenGenerating, setVideoGenError]);

  // Refresh versions when a generation finishes (isGenerating transitions true → false)
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating && open) {
      fetchVersions();
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, open, fetchVersions]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function toggleMock() {
    setUseMock((prev) => {
      const next = !prev;
      localStorage.setItem("video-gen-mock", next ? "true" : "false");
      return next;
    });
  }

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
    const updated = { ...imageRolesProp };
    if (newRole === "start_frame" || newRole === "end_frame") {
      for (const [id, role] of Object.entries(updated)) {
        if (id !== imageId && role === newRole) updated[id] = "reference";
      }
    }
    updated[imageId] = newRole;
    onPatch({ imageRoles: updated });
  }

  async function handleGenerate() {
    setGenerating(true);
    setLastError(null);
    try {
      await videoGenApi.startGeneration(nodeId, {
        modelId,
        params,
        imageRoles: imageRolesProp,
        mock: useMock,
      });
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

  const imageInputs = videoGenClientModelMap[modelId]?.imageInputs ?? {
    startFrame: true,
    endFrame: false,
    maxReferenceImages: 0,
  };

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
                  {/* Mock mode switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useMock}
                    onClick={toggleMock}
                    className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>Mock</span>
                    <div
                      className={cn(
                        "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
                        useMock ? "bg-amber-400" : "bg-muted-foreground/25",
                      )}
                    >
                      <span
                        className={cn(
                          "block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200",
                          useMock ? "translate-x-3" : "translate-x-0",
                        )}
                      />
                    </div>
                  </button>
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
                <LeftSection
                  icon={History}
                  label="History"
                  badge={`${versions.length} version${versions.length === 1 ? "" : "s"}`}
                  open={historyOpen}
                  onToggle={() => setHistoryOpen((p) => !p)}
                >
                  {historyOpen ? (
                    <VideoGenVersionHistory
                      versions={versions}
                      activeVersionId={activeVersionId}
                      onRestore={handleRestoreVersion}
                      restoring={restoring}
                      hideHeader
                    />
                  ) : (
                    <ActiveVersionRow versions={versions} activeVersionId={activeVersionId} />
                  )}
                </LeftSection>
              )}

              <LeftSection
                icon={Settings2}
                label="Output settings"
                open={settingsOpen}
                onToggle={() => setSettingsOpen((p) => !p)}
              >
                {settingsOpen && (
                  <VideoGenParamsPanel
                    modelId={modelId}
                    params={params}
                    onModelChange={handleModelChange}
                    onParamChange={handleParamChange}
                  />
                )}
              </LeftSection>

              <LeftSection
                icon={Link2}
                label="Connected"
                badge={`${(promptNode ? 1 : 0) + upstreamImages.length} input${(promptNode ? 1 : 0) + upstreamImages.length === 1 ? "" : "s"}`}
                open={connectedOpen}
                onToggle={() => setConnectedOpen((p) => !p)}
              >
                {connectedOpen && (
                  <VideoGenConnectedSection
                    promptNode={promptNode}
                    images={upstreamImages}
                    imageRoles={imageRolesProp}
                    imageInputs={imageInputs}
                    onRoleChange={handleRoleChange}
                  />
                )}
              </LeftSection>
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
                  <div className="flex size-full items-center justify-center">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full max-h-full rounded-xl border border-border shadow-card"
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
