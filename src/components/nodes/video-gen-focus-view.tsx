"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  Clapperboard,
  History,
  ImageIcon,
  PencilLine,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_VIDEO_CLIENT_MODEL_ID,
  defaultsForVideoModel,
  videoGenClientModelMap,
} from "@/lib/video-gen/client-models";
import { smartMergeVideoParams } from "@/lib/video-gen/params/merge";
import {
  buildConstraintState,
  evaluateConstraints,
} from "@/lib/video-gen/constraints";
import { videoGenApi } from "@/lib/video-gen/api";
import { VideoGenApiError } from "@/lib/video-gen/api";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useVideoGenStatus } from "@/hooks/use-video-gen-status";
import {
  VideoGenVersionHistory,
  type VideoGenVersionSummary,
} from "./video-gen-version-history";
import { VideoGenUsagePopover } from "./video-gen-usage-popover";
import { VideoGenParamsPanel, hasParamsInGroup } from "./video-gen-params-panel";
import { VideoGenConnectedSection } from "./video-gen-connected-section";
import { RailItem } from "./focus-rail-item";
import { AddConnection } from "./add-connection";
import type { UpstreamImage, UpstreamPromptNode } from "@/lib/video-gen/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActiveRulesCard } from "./video-gen-active-rules-card";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageRole = "start_frame" | "end_frame" | "reference";

type ImageInputs = { startFrame: boolean; endFrame: boolean; maxReferenceImages: number };

type DialogState =
  | null
  | { type: "no-roles" }
  | { type: "missing-end-frame" }
  | { type: "role-conflict"; imageId: string; role: ImageRole; conflictingRole: "start_frame" | "end_frame" | "reference" }
  | { type: "replace-singleton"; imageId: string; role: "start_frame" | "end_frame"; incumbentId: string; incumbentName: string };

// Fill in default roles for any unassigned images:
// - refs available → all images get "reference" (up to the cap)
// - no refs → first unassigned = "start_frame", second = "end_frame"
function applyDefaultImageRoles(
  images: UpstreamImage[],
  inputs: ImageInputs,
  existing: Record<string, ImageRole>,
): Record<string, ImageRole> {
  if (images.length === 0) return existing;
  const roles = { ...existing };
  const unassigned = images.filter((img) => !(img.id in roles));
  if (unassigned.length === 0) return roles;

  if (inputs.maxReferenceImages > 0) {
    const usedRefs = Object.values(roles).filter((r) => r === "reference").length;
    const slots = inputs.maxReferenceImages - usedRefs;
    unassigned.slice(0, slots).forEach((img) => { roles[img.id] = "reference"; });
  } else {
    let i = 0;
    if (inputs.startFrame && !Object.values(roles).includes("start_frame") && unassigned[i]) {
      roles[unassigned[i].id] = "start_frame";
      i++;
    }
    if (inputs.endFrame && !Object.values(roles).includes("end_frame") && unassigned[i]) {
      roles[unassigned[i].id] = "end_frame";
    }
  }
  return roles;
}

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

// ── Connected item detail view ────────────────────────────────────────────────

function VideoGenDetailPanel({
  item,
  promptNode,
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
  onBack,
}: {
  item: { id: string; type: "prompt" | "image" };
  promptNode: UpstreamPromptNode | null;
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: {
    startFrame: boolean;
    endFrame: boolean;
    maxReferenceImages: number;
  };
  onRoleChange: (imageId: string, role: ImageRole) => void;
  onBack: () => void;
}) {
  const image =
    item.type === "image" ? images.find((img) => img.id === item.id) : null;
  const referenceCount = Object.values(imageRoles).filter(
    (r) => r === "reference",
  ).length;

  function getTooltip(role: ImageRole): string | null {
    if (role === "start_frame" && !imageInputs.startFrame)
      return "Not supported by this model";
    if (role === "end_frame" && !imageInputs.endFrame)
      return "Not supported by this model";
    if (role === "reference") {
      if (imageInputs.maxReferenceImages === 0)
        return "Not supported by this model";
      if (
        referenceCount >= imageInputs.maxReferenceImages &&
        imageRoles[item.id] !== "reference"
      )
        return `Max ${imageInputs.maxReferenceImages} reference image${imageInputs.maxReferenceImages === 1 ? "" : "s"}`;
    }
    return null;
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to video
      </button>

      {item.type === "prompt" && promptNode && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <span className="text-eyebrow">Video prompt</span>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-5">
            {promptNode.text ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                {promptNode.text}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No motion prompt generated yet — generate from the video-prompt
                node first.
              </p>
            )}
          </div>
        </div>
      )}

      {item.type === "image" && image && (
        <div className="flex flex-col gap-4">
          {/* Cap the image height so the role buttons stay visible without scrolling. */}
          <div className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/10">
            <img
              src={image.imageUrl}
              alt="Connected image"
              className="max-h-[52vh] w-auto max-w-full object-contain"
            />
          </div>
          <TooltipProvider>
            <div className="flex justify-center gap-3">
              {(["start_frame", "end_frame", "reference"] as const).map(
                (role) => {
                  const label =
                    role === "start_frame"
                      ? "Start frame"
                      : role === "end_frame"
                        ? "End frame"
                        : "Reference";
                  const tooltip = getTooltip(role);
                  const disabled = tooltip !== null;
                  const active = imageRoles[item.id] === role;
                  return (
                    <Tooltip key={role}>
                      <TooltipTrigger render={<span />}>
                        <button
                          type="button"
                          aria-disabled={disabled}
                          onClick={() =>
                            !disabled && onRoleChange(item.id, role)
                          }
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:bg-muted",
                            disabled && "cursor-not-allowed opacity-40",
                          )}
                        >
                          {label}
                        </button>
                      </TooltipTrigger>
                      {tooltip && (
                        <TooltipContent side="top">{tooltip}</TooltipContent>
                      )}
                    </Tooltip>
                  );
                },
              )}
            </div>
          </TooltipProvider>
        </div>
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
  // The selected rail item: "video" (settings + preview), "history", "details", or a connected
  // node's id (middle column shows that node's role/detail view). Mirrors image-gen-focus-view.
  const [selected, setSelected] = useState<string>("video");
  // Only the Advanced group collapses (Audio / Multi-Shot / Negative Prompt); Frames and
  // Output settings are always expanded. Defaults closed so the panel opens uncluttered.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<DialogState>(null);
  const hasExplicitlySkippedEndFrameRef = useRef(false);

  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingConnected, setLoadingConnected] = useState(false);

  // Reset detail view when the sheet opens or switches to a different node; re-arm skeletons.
  const [openNodeSeed, setOpenNodeSeed] = useState({ open, nodeId });
  if (openNodeSeed.open !== open || openNodeSeed.nodeId !== nodeId) {
    setOpenNodeSeed({ open, nodeId });
    setPendingDialog(null);
    if (open) {
      setSelected("video");
      setLoadingVersions(true);
      setLoadingConnected(true);
    }
  }

  // Reset the "skipped end frame" guard when the sheet opens or switches nodes.
  useEffect(() => {
    hasExplicitlySkippedEndFrameRef.current = false;
  }, [open, nodeId]);

  const { isGenerating, lastError, setGenerating, setLastError } =
    useVideoGenStatus(nodeId);

  // Stable Zustand actions — used directly in effects so deps don't include
  // the per-render wrapper functions returned by useVideoGenStatus.
  const setVideoGenGenerating = useCanvasStore((s) => s.setVideoGenGenerating);
  const setVideoGenError = useCanvasStore((s) => s.setVideoGenError);
  const editable = useCanvasEditable(); // D33: false when this session is read-only

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
      .then(({ data }: { data: unknown }) => {
        const row = data as { status: string; error: string | null } | null;
        if (!row) return;
        if (row.status === "succeeded" || row.status === "failed") {
          setVideoGenGenerating(nodeId, false);
          setVideoGenError(
            nodeId,
            row.status === "failed" ? (row.error ?? "Generation failed") : null,
          );
        }
      });
    videoGenApi
      .fetchVersions(nodeId)
      .then((data) => {
        setVersions(data.versions);
        setActiveVersionId(data.activeVersionId);
        const active = data.versions.find((v) => v.id === data.activeVersionId);
        if (active?.output) onPatchRef.current({ parsed: active.output });
      })
      .catch(() => {})
      .finally(() => setLoadingVersions(false));
    videoGenApi
      .fetchUpstreamImages(nodeId)
      .then(({ images, promptNode: pn }) => {
        setUpstreamImages(images);
        setPromptNode(pn);
        hasExplicitlySkippedEndFrameRef.current = false;
      })
      .catch(() => {})
      .finally(() => setLoadingConnected(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function handleModelChange(nextModelId: string) {
    setModelId(nextModelId);
    const nextModel = videoGenClientModelMap[nextModelId];
    const defaults = nextModel
      ? smartMergeVideoParams(params, nextModel)
      : defaultsForVideoModel(nextModelId);

    // Migrate image roles — remove roles the new model doesn't support
    const nextInputs = videoGenClientModelMap[nextModelId]?.imageInputs;
    const currentRoles = { ...imageRolesProp };
    let startFrameAssigned =
      Object.values(currentRoles).includes("start_frame");

    if (nextInputs) {
      for (const [imageId, role] of Object.entries(currentRoles)) {
        const invalid =
          (role === "reference" && nextInputs.maxReferenceImages === 0) ||
          (role === "end_frame" && !nextInputs.endFrame) ||
          (role === "start_frame" && !nextInputs.startFrame);

        if (invalid) {
          if (!startFrameAssigned && nextInputs.startFrame) {
            currentRoles[imageId] = "start_frame";
            startFrameAssigned = true;
          } else {
            delete currentRoles[imageId];
          }
        }
      }
    }

    const finalRoles = nextInputs
      ? applyDefaultImageRoles(upstreamImages, nextInputs, currentRoles)
      : currentRoles;

    // Toast for dropped role assignments (§E)
    const droppedImages = upstreamImages.filter(
      (img) => img.id in currentRoles && !(img.id in finalRoles),
    );
    const toastMessages = droppedImages.map((img) => {
      const oldRole = (currentRoles[img.id] as string).replace(/_/g, " ");
      return `"${img.filename || "Image"}" removed from ${oldRole} — not supported by ${nextModel?.label ?? nextModelId}`;
    });
    if (toastMessages.length > 0) {
      if (toastMessages.length <= 3) {
        toastMessages.forEach((msg) => toast.info(msg, { duration: 3500 }));
      } else {
        toastMessages.slice(0, 3).forEach((msg) => toast.info(msg, { duration: 3500 }));
        toast.info(`…and ${toastMessages.length - 3} more role${toastMessages.length - 3 === 1 ? "" : "s"} removed`, { duration: 3500 });
      }
    }

    // Commit any constraint-locked values into params so they persist after the lock clears.
    const nextConstraints = evaluateConstraints(
      videoGenClientModelMap[nextModelId]?.rules,
      buildConstraintState(finalRoles, defaults),
    );
    const finalParams = { ...defaults, ...nextConstraints.lockedParams };

    setParams(finalParams);
    onPatch({ modelId: nextModelId, params: finalParams, imageRoles: finalRoles });
  }

  function handleParamChange(name: string, value: unknown) {
    const updated = { ...params, [name]: value };
    setParams(updated);
    onPatch({ params: updated });
  }

  function handleRoleChange(imageId: string, newRole: ImageRole) {
    const updated = { ...effectiveImageRoles };

    // Toggle: clicking the role already assigned to this image clears it
    if (updated[imageId] === newRole) {
      delete updated[imageId];
      onPatch({ imageRoles: updated });
      return;
    }

    // Conflict check (§D): role is blocked by an active constraint
    const isFrameRole = newRole === "start_frame" || newRole === "end_frame";
    const isRefRole = newRole === "reference";
    if (isFrameRole && constraints.disableFrameInputs) {
      // Frames are blocked because refs are active
      const conflictingRole: ImageRole = "reference";
      setPendingDialog({ type: "role-conflict", imageId, role: newRole, conflictingRole });
      return;
    }
    if (isRefRole && constraints.disableRefs) {
      // Refs are blocked because frames are active
      const hasStart = Object.values(updated).includes("start_frame");
      const conflictingRole: ImageRole = hasStart ? "start_frame" : "end_frame";
      setPendingDialog({ type: "role-conflict", imageId, role: newRole, conflictingRole });
      return;
    }

    // Singleton replacement check (§G): start_frame or end_frame already held by another image
    if (newRole === "start_frame" || newRole === "end_frame") {
      const incumbentId = Object.entries(updated).find(
        ([id, r]) => id !== imageId && r === newRole,
      )?.[0];
      if (incumbentId) {
        const incumbentImage = upstreamImages.find((img) => img.id === incumbentId);
        const incumbentName = incumbentImage?.filename ?? "";
        setPendingDialog({
          type: "replace-singleton",
          imageId,
          role: newRole,
          incumbentId,
          incumbentName,
        });
        return;
      }
    }

    // No conflict, no replacement needed — apply directly
    updated[imageId] = newRole;
    commitRoleChange(updated);
  }

  function commitRoleChange(updated: Record<string, ImageRole>) {
    const nextConstraints = evaluateConstraints(
      currentModel?.rules,
      buildConstraintState(updated, params),
    );
    const lockedEntries = Object.entries(nextConstraints.lockedParams);
    const changedLocked = lockedEntries.some(([k, v]) => params[k] !== v);
    if (changedLocked) {
      const nextParams = { ...params, ...nextConstraints.lockedParams };
      setParams(nextParams);
      onPatch({ imageRoles: updated, params: nextParams });
    } else {
      onPatch({ imageRoles: updated });
    }
  }

  function handleReset() {
    onPatch({ imageRoles: {} });
  }

  async function handleGenerate() {
    // C0 (Kling): start frame required — button should be disabled, but guard anyway
    if (currentModel?.provider === "kling") {
      const hasStartFrame = Object.values(effectiveImageRoles).includes("start_frame");
      if (!hasStartFrame) return;
    }

    // C2: images connected but none assigned (non-Kling providers)
    if (upstreamImages.length > 0 && Object.keys(effectiveImageRoles).length === 0) {
      setPendingDialog({ type: "no-roles" });
      return;
    }

    // C3: end frame slot available, start frame assigned, unassigned images exist, no end frame
    const hasStartFrame = Object.values(effectiveImageRoles).includes("start_frame");
    const hasEndFrame = Object.values(effectiveImageRoles).includes("end_frame");
    const hasUnassigned = upstreamImages.some((img) => !(img.id in effectiveImageRoles));
    if (
      imageInputs.endFrame &&
      hasStartFrame &&
      !hasEndFrame &&
      hasUnassigned &&
      !hasExplicitlySkippedEndFrameRef.current
    ) {
      setPendingDialog({ type: "missing-end-frame" });
      return;
    }

    await doGenerate();
  }

  async function doGenerate() {
    setGenerating(true);
    setLastError(null);
    try {
      await videoGenApi.startGeneration(nodeId, {
        modelId,
        params,
        imageRoles: effectiveImageRoles,
      });
      // 202 Accepted — hook's Realtime subscription clears isGenerating on completion
    } catch (e) {
      setGenerating(false);
      const msg =
        e instanceof VideoGenApiError && e.status === 402
          ? CREDIT_LIMIT_TOAST_MESSAGE
          : e instanceof Error
            ? e.message
            : "Generation failed";
      setLastError(msg);
      toast.error(msg, { duration: 6000 });
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

  const durationSeconds = Number(params.seconds ?? params.duration ?? 0);
  const audioEnabled = isVideoAudioEnabled(params.audio);
  const resolution = asResolutionString(params.resolution);
  const videoCostEstimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
  const estimatedCredits = videoCostEstimate ? usdToFinalCredits(videoCostEstimate.usd) : null;

  // Filter out roles that are invalid for the current model — handles the timing gap
  // between setModelId (local, immediate) and imageRolesProp update (from parent, async).
  const effectiveImageRoles = Object.fromEntries(
    Object.entries(imageRolesProp).filter(([, role]) => {
      if (role === "reference" && imageInputs.maxReferenceImages === 0) return false;
      if (role === "end_frame" && !imageInputs.endFrame) return false;
      if (role === "start_frame" && !imageInputs.startFrame) return false;
      return true;
    }),
  ) as Record<string, ImageRole>;

  const currentModel = videoGenClientModelMap[modelId];
  const constraintState = buildConstraintState(
    effectiveImageRoles,
    params,
  );
  const constraints = evaluateConstraints(currentModel?.rules, constraintState);

  // Toast when locked params change — string key keeps dep array size constant
  const lockedParamsKey = JSON.stringify(constraints.lockedParams);
  const prevLockedRef = useRef<{ locked: Record<string, unknown>; reasons: Record<string, string> } | null>(null);
  useEffect(() => {
    const prev = prevLockedRef.current;
    prevLockedRef.current = { locked: constraints.lockedParams, reasons: constraints.lockedParamReasons };
    if (prev === null) return; // skip mount

    for (const [name, value] of Object.entries(constraints.lockedParams)) {
      if (prev.locked[name] !== value) {
        const reason = constraints.lockedParamReasons[name];
        const label = name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        toast.info(`${label} set to ${value}${reason ? ` · ${reason}` : ""}`, { duration: 3500 });
      }
    }
    for (const name of Object.keys(prev.locked)) {
      if (!(name in constraints.lockedParams)) {
        const label = name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        toast.info(`${label} unlocked`, { duration: 2500 });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedParamsKey]);

  const mode: "skeleton" | "result" | "empty" = isGenerating
    ? "skeleton"
    : videoUrl
      ? "result"
      : "empty";

  // ── Rail: connected items + selection (mirrors image-gen-focus-view) ─────────
  const connectedItems: { id: string; type: "prompt" | "image"; label: string }[] = [
    ...(promptNode ? [{ id: promptNode.id, type: "prompt" as const, label: "Video prompt" }] : []),
    ...upstreamImages.map((img) => ({
      id: img.id,
      type: "image" as const,
      label: img.filename || "Image",
    })),
  ];
  const connectedCount = connectedItems.length;
  const hasFrames = upstreamImages.length > 0;
  const isNodeSelected = !["video", "history", "details"].includes(selected);
  const selectedDetailItem = isNodeSelected
    ? connectedItems.find((c) => c.id === selected) ?? null
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        {/* Header */}
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  <EditableField
                    value={title || ""}
                    onCommit={(t) => onPatch({ title: normalizeTitle(t) })}
                    placeholder="Video generation"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {versions.length > 0 && (
                    <VideoGenUsagePopover
                      versions={versions}
                      nodeId={nodeId}
                      upstreamNodeIds={[
                        ...(promptNode ? [promptNode.id] : []),
                        ...upstreamImages.map((u) => u.id),
                      ]}
                    />
                  )}
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <Button
                        size="lg"
                        onClick={handleGenerate}
                        disabled={
                          isGenerating ||
                          constraints.disableGenerate ||
                          !editable ||
                          (currentModel?.provider === "kling" &&
                            !Object.values(effectiveImageRoles).includes("start_frame"))
                        }
                      >
                        <Sparkles className="size-4" strokeWidth={1.5} />
                        {isGenerating
                          ? "Generating…"
                          : videoUrl
                            ? "Re-generate"
                            : "Generate"}
                        {!isGenerating && estimatedCredits !== null && ` · ${estimatedCredits}`}
                      </Button>
                    </TooltipTrigger>
                    {(constraints.disableGenerate && constraints.disableGenerateReason) ? (
                      <TooltipContent side="bottom">
                        {constraints.disableGenerateReason}
                      </TooltipContent>
                    ) : currentModel?.provider === "kling" &&
                      !Object.values(effectiveImageRoles).includes("start_frame") ? (
                      <TooltipContent side="bottom">
                        Kling requires a start frame — connect an image and assign it as Start Frame
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                </div>
                {lastError && !isGenerating && (
                  <div className="mt-1">
                    <GenerationErrorBadge error={lastError} />
                  </div>
                )}
              </div>
            </header>
          </div>
        </div>

        {/* Body: rail + detail pane (nav | options | output) — mirrors image-gen-focus-view */}
        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          {/* Rail */}
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem
              icon={<Clapperboard className="size-4 text-primary" />}
              label="Video"
              active={selected === "video"}
              onClick={() => setSelected("video")}
            />

            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Connected · {connectedCount}
              </span>
              <AddConnection
                targetId={nodeId}
                targetType="video-gen"
                connectedIds={connectedItems.map((c) => c.id)}
              />
            </div>
            {loadingConnected ? (
              <div className="space-y-1.5 px-1 pt-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded-md bg-muted-foreground/15" />
                ))}
              </div>
            ) : connectedCount === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">No inputs connected.</p>
            ) : (
              connectedItems.map((c) => {
                const role = c.type === "image" ? effectiveImageRoles[c.id] : undefined;
                return (
                  <RailItem
                    key={c.id}
                    icon={
                      c.type === "prompt" ? (
                        <PencilLine className="size-4 text-primary" strokeWidth={1.5} />
                      ) : (
                        <ImageIcon className="size-4 text-primary" strokeWidth={1.5} />
                      )
                    }
                    label={c.label}
                    active={selected === c.id}
                    onClick={() => setSelected(c.id)}
                    badge={
                      role ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold",
                            role === "start_frame"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {role === "start_frame" ? "Start" : role === "end_frame" ? "End" : "Ref"}
                        </span>
                      ) : undefined
                    }
                  />
                );
              })
            )}

            <div className="mx-2.5 my-2 h-px bg-border" />
            <RailItem
              icon={<History className="size-4 text-primary" />}
              label="History"
              active={selected === "history"}
              onClick={() => setSelected("history")}
              badge={
                versions.length > 0 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{versions.length}</span>
                ) : undefined
              }
            />
            <RailItem
              icon={<SlidersHorizontal className="size-4 text-primary" />}
              label="Details"
              active={selected === "details"}
              onClick={() => setSelected("details")}
            />
          </nav>

          {/* Detail pane: the middle column swaps with the rail selection; the output column on
              the right is ALWAYS visible so the operator can tune while watching the result. */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Middle column */}
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-r border-border">
              {/* Video — flat, independently-collapsible peer groups (Frames / Output / Fine-tune / Advanced) */}
              {selected === "video" && (
                <div className="flex flex-col gap-10 px-6 py-5">
                  {(() => {
                    const paramsPanelProps = {
                      modelId,
                      params,
                      onModelChange: handleModelChange,
                      onParamChange: handleParamChange,
                      lockedParams: constraints.lockedParams,
                      lockedParamReasons: constraints.lockedParamReasons,
                    };
                    const groups: { id: string; icon: LucideIcon; label: string; body: ReactNode }[] = [];
                    if (hasFrames) {
                      groups.push({
                        id: "frames",
                        icon: ImageIcon,
                        label: "Frames",
                        body: (
                          <VideoGenConnectedSection
                            promptNode={null}
                            images={upstreamImages}
                            imageRoles={effectiveImageRoles}
                            imageInputs={imageInputs}
                            onRoleChange={handleRoleChange}
                            onConflictingRoleRequest={(imageId, role) => {
                              const isFrameRole = role === "start_frame" || role === "end_frame";
                              if (isFrameRole) {
                                setPendingDialog({ type: "role-conflict", imageId, role, conflictingRole: "reference" });
                              } else {
                                const hasStart = Object.values(effectiveImageRoles).includes("start_frame");
                                setPendingDialog({
                                  type: "role-conflict",
                                  imageId,
                                  role,
                                  conflictingRole: hasStart ? "start_frame" : "end_frame",
                                });
                              }
                            }}
                            onOpenDetail={(id) => setSelected(id)}
                            disableFrameInputs={constraints.disableFrameInputs}
                            disableFrameInputsReason={constraints.disableFrameInputsReason}
                            disableRefs={constraints.disableRefs}
                            disableRefsReason={constraints.disableRefsReason}
                            onReset={handleReset}
                          />
                        ),
                      });
                    }
                    groups.push({
                      id: "output",
                      icon: Settings2,
                      label: "Output settings",
                      body: <VideoGenParamsPanel {...paramsPanelProps} group="primary" />,
                    });
                    // Frames and Output settings stay expanded; Advanced is the one collapsible
                    // group, so the secondary controls don't crowd the panel by default.
                    return (
                      <>
                        {groups.map((g) => (
                          <LeftSection key={g.id} icon={g.icon} label={g.label}>
                            {g.body}
                          </LeftSection>
                        ))}
                        {hasParamsInGroup(modelId, "advanced") && (
                          <LeftSection
                            icon={SlidersHorizontal}
                            label="Advanced"
                            open={advancedOpen}
                            onToggle={() => setAdvancedOpen((o) => !o)}
                          >
                            {advancedOpen && (
                              <VideoGenParamsPanel {...paramsPanelProps} group="advanced" />
                            )}
                          </LeftSection>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Connected node — role assignment / read-only detail */}
              {isNodeSelected &&
                (selectedDetailItem ? (
                  <VideoGenDetailPanel
                    item={selectedDetailItem}
                    promptNode={promptNode}
                    images={upstreamImages}
                    imageRoles={effectiveImageRoles}
                    imageInputs={imageInputs}
                    onRoleChange={handleRoleChange}
                    onBack={() => setSelected("video")}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-6">
                    <p className="text-sm text-muted-foreground">
                      {loadingConnected ? "Loading…" : "This input has no preview yet."}
                    </p>
                  </div>
                ))}

              {/* History — every generation */}
              {selected === "history" && (
                <div className="px-6 py-5">
                  {loadingVersions ? (
                    <div className="space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
                      <div className="space-y-1.5 pt-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="size-2 shrink-0 animate-pulse rounded-full bg-muted-foreground/20" />
                            <div className="h-3 animate-pulse rounded bg-muted-foreground/20" style={{ width: `${55 + i * 12}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : versions.length > 0 ? (
                    <VideoGenVersionHistory
                      versions={versions}
                      activeVersionId={activeVersionId}
                      onRestore={handleRestoreVersion}
                      restoring={restoring}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No generations yet — every attempt will show up here.
                    </p>
                  )}
                </div>
              )}

              {/* Details — active constraint rules */}
              {selected === "details" && (
                <div className="px-6 py-5">
                  <ActiveRulesCard constraints={constraints} />
                </div>
              )}
            </div>

            {/* Right column — the video, always visible */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
              <div className="flex items-center gap-1.5">
                <Clapperboard className="size-3.5 text-primary" strokeWidth={1.5} />
                <span className="text-eyebrow">Video</span>
              </div>
              <div className="min-h-0 flex-1">
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

        {/* ── Dialog hub — all dialogs driven by pendingDialog state ── */}
        <AlertDialog
          open={pendingDialog !== null}
          onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        >
          <AlertDialogContent>
            {pendingDialog?.type === "no-roles" && (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>No frame selected</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have connected images but haven&apos;t assigned any role (start frame, end
                    frame, or reference). Generate anyway using only the text prompt?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void doGenerate()}>
                    Generate anyway
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}

            {pendingDialog?.type === "missing-end-frame" && (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>End frame not assigned</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have a connected image without a role, and this model supports an end
                    frame. Generate with just the start frame?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      hasExplicitlySkippedEndFrameRef.current = true;
                      void doGenerate();
                    }}
                  >
                    Generate anyway
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}

            {pendingDialog?.type === "role-conflict" && (() => {
              const d = pendingDialog;
              const isAddingRef = d.role === "reference";
              const modelLabel = currentModel?.label ?? "This model";
              const removeWhat = isAddingRef ? "start/end frame assignments" : "reference image assignments";
              const switchingTo = isAddingRef ? "reference images" : "start/end frames";
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Can&apos;t combine these roles</AlertDialogTitle>
                    <AlertDialogDescription>
                      {modelLabel} doesn&apos;t support reference images together with start/end
                      frames. Switching to {switchingTo} will remove your {removeWhat}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const updated = { ...effectiveImageRoles };
                        for (const [id, r] of Object.entries(updated)) {
                          if (isAddingRef && (r === "start_frame" || r === "end_frame")) {
                            delete updated[id];
                          } else if (!isAddingRef && r === "reference") {
                            delete updated[id];
                          }
                        }
                        updated[d.imageId] = d.role;
                        commitRoleChange(updated);
                      }}
                    >
                      Switch to {switchingTo}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}

            {pendingDialog?.type === "replace-singleton" && (() => {
              const d = pendingDialog;
              const roleLabel = d.role === "start_frame" ? "start frame" : "end frame";
              const incumbentLabel = d.incumbentName
                ? `"${d.incumbentName}"`
                : `the current ${roleLabel}`;
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Replace {roleLabel}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {incumbentLabel} is currently set as the {roleLabel}. Replace it with this
                      image?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const updated = { ...effectiveImageRoles };
                        if (imageInputs.maxReferenceImages > 0) {
                          updated[d.incumbentId] = "reference";
                        } else {
                          delete updated[d.incumbentId];
                        }
                        updated[d.imageId] = d.role;
                        commitRoleChange(updated);
                      }}
                    >
                      Replace
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
