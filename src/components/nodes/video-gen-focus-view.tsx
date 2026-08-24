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
  BadgeCheck,
  ChevronDown,
  Clapperboard,
  History,
  ImageIcon,
  PencilLine,
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
import { paramsForRestore } from "@/lib/generations/version-params";
import {
  areFramesAndRefsExclusive,
  buildConstraintState,
  evaluateConstraints,
  reconcileLockedParams,
  reconcileRolesWithRules,
} from "@/lib/video-gen/constraints";
import { videoGenApi } from "@/lib/video-gen/api";
import { VideoGenApiError } from "@/lib/video-gen/api";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useCanvasStore, useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useIdentity } from "@/hooks/use-identity";
import { InlineApprovalBar } from "./inline-approval-bar";
import { ApprovalSkeleton } from "./approval-skeleton";
import {
  setVersionApprovalAction,
  markVersionApprovalSeenAction,
} from "@/lib/actions/approval";
import type { ApprovalStatus } from "@/lib/approval";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { useVideoGenStatus } from "@/hooks/use-video-gen-status";
import {
  VideoGenVersionHistory,
  type VideoGenVersionSummary,
} from "./video-gen-version-history";
import { VideoGenUsagePopover } from "./video-gen-usage-popover";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoGenParamsPanel } from "./video-gen-params-panel";
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
import { VideoGenShotSpine } from "./video-gen-shot-spine";
import { VideoGenModelPicker } from "./video-gen-model-picker";
import { describeShotSpine, describeDurationLabel } from "@/lib/video-gen/shot-spine";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageRole = "start_frame" | "end_frame" | "reference";

type ImageInputs = { startFrame: boolean; endFrame: boolean; maxReferenceImages: number };

// Only the generate-time "no roles assigned" confirm remains. Role assignment itself never opens
// a dialog: every such change is one click to make and one click to undo, and stacking a modal on
// the focus view's own sheet to ask about it was a nested-modal antipattern.
type DialogState = null | { type: "no-roles" };

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
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        className="h-auto gap-1.5 self-start border-0 p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to video
      </Button>

      {item.type === "prompt" && promptNode && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <span className="text-eyebrow">Motion prompt</span>
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
                        <Button
                          type="button"
                          variant="ghost"
                          aria-disabled={disabled}
                          onClick={() =>
                            !disabled && onRoleChange(item.id, role)
                          }
                          className={cn(
                            "h-auto rounded-lg border px-4 py-2 transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                              : "border-border bg-background text-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted",
                            disabled && "cursor-not-allowed opacity-40",
                          )}
                        >
                          {label}
                        </Button>
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
  // D29 approval flag — R10.1. video-gen-node.tsx has always rendered ApprovalBadge, but
  // this focus view had no control able to change it, so a video read "Pending" forever.
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // The selected rail item: "video" (settings + preview), "history", "details", or a connected
  // node's id (middle column shows that node's role/detail view). Mirrors image-gen-focus-view.
  const focusStoreApi = useCanvasStoreApi();
  // Initialised from the store, not just updated on the open TRANSITION: arriving from a
  // navbar-inbox link can mount this view already open, in which case the transition never
  // fires and the requested section would be lost.
  const [selected, setSelected] = useState<string>(
    () => (open ? focusStoreApi.getState().focusSection : null) ?? "video",
  );
  // Only the Advanced group collapses (Audio / Multi-Shot / Negative Prompt); Frames and
  // Output settings are always expanded. Defaults closed so the panel opens uncluttered.
  const [pendingDialog, setPendingDialog] = useState<DialogState>(null);

  // Seeded from `open`, not `false`. The seed block below re-arms these on the false → true
  // TRANSITION, which any path that mounts the view ALREADY open never has.
  //
  // Both branches hit this independently. Guided creation: guidedCreateNext and
  // setFocusedNodeId land in the same batch, so the card mounts with its focus view open
  // and the rail rendered "No inputs connected." instead of a skeleton. Review: a
  // navbar-inbox link does the same, and the Review section asserted "Generate a video
  // first…" before snapping to the approval control. One bug, two symptoms.
  const [loadingVersions, setLoadingVersions] = useState(open);
  const [loadingConnected, setLoadingConnected] = useState(open);

  // Reset detail view when the sheet opens or switches to a different node; re-arm skeletons.
  const [openNodeSeed, setOpenNodeSeed] = useState({ open, nodeId });
  if (openNodeSeed.open !== open || openNodeSeed.nodeId !== nodeId) {
    setOpenNodeSeed({ open, nodeId });
    setPendingDialog(null);
    if (open) {
      // Normally the video pane — but a programmatic open from the review drawer or the
      // navbar inbox asks for "details", where sign-off lives. Landing on the video pane
      // would make a reviewer hunt for the control they were sent here to use.
      setSelected(focusStoreApi.getState().focusSection ?? "video");
      setLoadingVersions(true);
      setLoadingConnected(true);
    }
  }

  // Clear the one-shot section request once this view has consumed it, so opening any
  // other node afterwards goes to its own default. Guarded on `open`, so the many closed
  // focus views mounted across the canvas never clear a request meant for one of them.
  useEffect(() => {
    if (open) focusStoreApi.getState().setFocusSection(null);
  }, [open, focusStoreApi]);

  const { isGenerating, lastError, setGenerating, setLastError } =
    useVideoGenStatus(nodeId);

  // Stable Zustand actions — used directly in effects so deps don't include
  // the per-render wrapper functions returned by useVideoGenStatus.
  const setVideoGenGenerating = useCanvasStore((s) => s.setVideoGenGenerating);
  const setVideoGenError = useCanvasStore((s) => s.setVideoGenError);
  const disconnectNodes = useCanvasStore((s) => s.disconnectNodes);
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const { identity } = useIdentity();
  const flushAutosave = useFlushAutosave();

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
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
      setApprovedByName(active?.approvedByName ?? null);
      setApprovedAt(active?.approvedAt ?? null);
    } catch {
      /* best-effort */
    }
  }, [nodeId]);

  // Unlike image-gen/prompt, this view's connected inputs are NOT read off the store —
  // the route walks persisted edges two levels up (node → video-prompt → video-gen),
  // so anything that rewires the canvas has to refetch to be seen here.
  // Promise-chain (not async/await) so the setState calls sit inside a .then callback —
  // react-hooks/set-state-in-effect reads an awaited setState as a synchronous one.
  const refreshUpstream = useCallback(
    () =>
      videoGenApi
        .fetchUpstreamImages(nodeId)
        .then(({ images, promptNode: pn }) => {
          setUpstreamImages(images);
          setPromptNode(pn);
        })
        .catch(() => {}),
    [nodeId],
  );

  // Wiring only writes the edge into the client store. Autosave persists it on a 600ms debounce,
  // so refetching straight away would race the save and read pre-change state — flush first,
  // exactly as the gallery drawer and reference picker do after connectNodes.
  const persistThenRefresh = useCallback(async () => {
    try {
      await flushAutosave();
    } catch (err) {
      console.error("[video-gen] autosave flush failed:", err);
    }
    await refreshUpstream();
  }, [flushAutosave, refreshUpstream]);

  // Unwire an input added by mistake. The role goes with the edge: read-time pruning already
  // keeps the tally honest, but leaving the entry behind grows a tail of ids in the stored
  // imageRoles that point at nothing.
  const handleDisconnect = useCallback(
    async (sourceId: string) => {
      disconnectNodes(sourceId, nodeId);
      const nextRoles = Object.fromEntries(
        Object.entries(imageRolesProp).filter(([id]) => id !== sourceId),
      );
      // onPatch directly, not onPatchRef — that ref exists to break an effect dep cycle, and
      // this only ever runs from a click, so reading it during render is both unnecessary
      // and something the React compiler rejects.
      onPatch({ imageRoles: nextRoles });
      if (selected === sourceId) setSelected("video");
      await persistThenRefresh();
    },
    [disconnectNodes, nodeId, imageRolesProp, onPatch, selected, persistThenRefresh],
  );

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
        setApprovalStatus(active?.approvalStatus ?? "pending");
        setApprovalNote(active?.note ?? "");
        setApprovedByName(active?.approvedByName ?? null);
        setApprovedAt(active?.approvedAt ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingVersions(false));
    // persistThenRefresh, not refreshUpstream: a node reached straight from the guided
    // "Create video generation" button exists only in the client store at this point, and the
    // upstream-images route walks PERSISTED edges — so fetching first beat autosave's 600ms
    // debounce and the Connected rail came up empty until a close-and-reopen. The flush is
    // covered by the same `loadingConnected` skeleton as the fetch behind it, so the sheet
    // still opens instantly and the wait reads as loading rather than as "nothing connected".
    void persistThenRefresh().finally(() => setLoadingConnected(false));
  }, [open, nodeId, setVideoGenGenerating, setVideoGenError, persistThenRefresh]);

  // Refresh versions when a generation finishes (isGenerating transitions true → false)
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating && open) {
      fetchVersions();
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, open, fetchVersions]);

  // D170: the maker's mirror of ?review=1 landing a reviewer on the node. Fire-and-forget
  // — the server no-ops for anyone who isn't the version's own maker, or when there's
  // nothing to mark, so this is safe to call unconditionally whenever this focus view is
  // showing an approved active version.
  useEffect(() => {
    if (!open || !activeVersionId || approvalStatus !== "approved") return;
    void markVersionApprovalSeenAction(activeVersionId).catch(() => {
      /* best-effort */
    });
  }, [open, activeVersionId, approvalStatus]);

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

    const nextRules = videoGenClientModelMap[nextModelId]?.rules;

    // Capability migration above only knows startFrame/endFrame/maxReferenceImages, and the
    // default fill happily adds references on top of existing frames — so reconcile against the
    // new model's RULES before persisting, or the node is written in a state the API rejects.
    const finalRoles = reconcileRolesWithRules(
      nextRules,
      nextInputs
        ? applyDefaultImageRoles(upstreamImages, nextInputs, currentRoles)
        : currentRoles,
      defaults,
    );

    // Commit any constraint-locked values into params so they persist after the lock clears.
    const nextConstraints = evaluateConstraints(
      nextRules,
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

    // Crossing the frames/references divide on a model that forbids the combination. This used
    // to open a confirm dialog — a modal stacked on the focus view's own sheet, asking about
    // something the operator can simply see happen and click again to undo. The spine states the
    // either/or up front instead, so the switch just happens: clear the other side, apply.
    const isFrameRole = newRole === "start_frame" || newRole === "end_frame";
    if (isFrameRole && constraints.disableFrameInputs) {
      for (const [id, r] of Object.entries(updated)) {
        if (r === "reference") delete updated[id];
      }
    }
    if (newRole === "reference" && constraints.disableRefs) {
      for (const [id, r] of Object.entries(updated)) {
        if (r === "start_frame" || r === "end_frame") delete updated[id];
      }
    }

    // Start and end are singletons, so assigning one displaces whoever held it. This used to ask
    // first; it no longer does. Nothing is destroyed — the incumbent becomes a reference where
    // the model has slots, otherwise it simply goes unassigned — and it is undone by clicking the
    // role again. A confirm on a reversible, single-click action is friction, not safety.
    if (newRole === "start_frame" || newRole === "end_frame") {
      const incumbentId = Object.entries(updated).find(
        ([id, r]) => id !== imageId && r === newRole,
      )?.[0];
      if (incumbentId) {
        if (imageInputs.maxReferenceImages > 0) {
          updated[incumbentId] = "reference";
        } else {
          delete updated[incumbentId];
        }
      }
    }

    updated[imageId] = newRole;
    commitRoleChange(updated);
  }

  function commitRoleChange(next: Record<string, ImageRole>) {
    // Demoting a displaced frame to "reference" can itself create the frames+refs combination
    // some models forbid, so reconcile before persisting rather than relying on the read-time
    // pass to hide it.
    const updated = reconcileRolesWithRules(currentModel?.rules, next, params);
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

    // D95: a missing end frame no longer interrupts. The preference for a start+end pair is
    // expressed by the shot spine's empty slot at rest, not by a confirm dialog on the way out.
    await doGenerate();
  }

  async function doGenerate() {
    setGenerating(true);
    setLastError(null);
    try {
      await videoGenApi.startGeneration(nodeId, {
        modelId,
        // D98: post the reconciled values, never the possibly-stale `params` state.
        params: effectiveParams,
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

  // R10.1 — matches image-gen-focus-view's saveApproval exactly.
  async function saveApproval(status: ApprovalStatus, note: string | null) {
    if (!activeVersionId) return;
    setApprovalSaving(true);
    try {
      await setVersionApprovalAction(activeVersionId, { status, note });
      setApprovalStatus(status);
      setApprovalNote(note ?? "");
      // Push into the store so the on-canvas badge refreshes immediately — without this
      // the badge stays stale until a full reload re-hydrates from the DB.
      onPatch({ approvalStatus: status });
    } catch (e) {
      // Surface the server's message, not a fixed string: after D166 the realistic
      // failures are "you are not permitted…" and "a note is required…", both of which
      // the reviewer needs to actually read.
      toast.error(e instanceof Error ? e.message : "Failed to save approval");
    } finally {
      setApprovalSaving(false);
    }
  }

  /**
   * Put the node back into the state that produced this version — its model and its params,
   * not only its video (YUV-295).
   *
   * Restoring used to write `parsed` alone, so v1's clip sat under whatever model and duration
   * happened to be set, and the very next Generate silently used those instead of the ones the
   * operator had just chosen to go back to.
   *
   * The version's params are read back through the restored model's own specs
   * (paramsForRestore), which drops the pipeline's `durationSeconds` bookkeeping and fills any
   * param the version predates with that model's default. A version whose model the client no
   * longer knows restores the video alone and says so — writing params that belong to no model
   * would leave the node unable to generate.
   */
  async function handleRestoreVersion(versionId: string) {
    setRestoring(true);
    // One toast for the whole gesture: the same id is handed to the success/error call below,
    // so sonner swaps this spinner in place rather than stacking a second toast under it.
    // Restore is two round trips (the POST, then the version refetch) — long enough that a
    // silent wait reads as a dead click.
    const toastId = toast.loading("Restoring version…");
    try {
      const { output, modelUsed, paramsUsed } = await videoGenApi.restoreVersion(nodeId, versionId);
      const restoredParams = modelUsed
        ? paramsForRestore(videoGenClientModelMap[modelUsed]?.params, paramsUsed)
        : null;
      if (modelUsed && restoredParams) {
        setModelId(modelUsed);
        setParams(restoredParams);
        onPatch({ parsed: output, modelId: modelUsed, params: restoredParams });
      } else {
        onPatch({ parsed: output });
      }
      setActiveVersionId(versionId);
      await fetchVersions();
      toast.success(
        restoredParams
          ? "Version restored — model and settings applied"
          : "Video restored — its settings are no longer available",
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", { id: toastId });
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

  // Roles are keyed by upstream node id and persist on the video node, so an id outlives its
  // edge: disconnect or delete the node and the entry stays behind. A ghost entry inflates the
  // spine tally past the connected count and would be posted as an input that no longer exists,
  // so the connected set — not the roles map — is the authority on what counts.
  //
  // Only while `loadingConnected` is false: an empty `upstreamImages` mid-fetch means "not known
  // yet", not "nothing connected", and pruning against it would blank every role for a frame
  // (and let a click in that window persist the blank).
  const connectedImageIds = new Set(upstreamImages.map((img) => img.id));

  // Also filter out roles that are invalid for the current model — handles the timing gap
  // between setModelId (local, immediate) and imageRolesProp update (from parent, async).
  const supportedImageRoles = Object.fromEntries(
    Object.entries(imageRolesProp).filter(([id, role]) => {
      if (!loadingConnected && !connectedImageIds.has(id)) return false;
      if (role === "reference" && imageInputs.maxReferenceImages === 0) return false;
      if (role === "end_frame" && !imageInputs.endFrame) return false;
      if (role === "start_frame" && !imageInputs.startFrame) return false;
      return true;
    }),
  ) as Record<string, ImageRole>;

  const currentModel = videoGenClientModelMap[modelId];

  // Capability is not the same as legality: a model can accept frames AND references and still
  // have a rule forbidding them together. Reconciling here (rather than only on model change)
  // also heals nodes already persisted in the contradictory state, which would otherwise stay
  // stuck failing at generate with no way for the operator to see why.
  const effectiveImageRoles = reconcileRolesWithRules(
    currentModel?.rules,
    supportedImageRoles,
    params,
  );
  const constraintState = buildConstraintState(
    effectiveImageRoles,
    params,
  );
  const constraints = evaluateConstraints(currentModel?.rules, constraintState);

  // No toasts for locked params or dropped roles. Switching model could fire several at once
  // (one per dropped role, one per newly-locked param) for state that is already on screen and
  // stays there: ActiveRulesCard lists every active reason persistently, and the params panel
  // renders locked controls as locked. A toast per change was duplicating a permanent display
  // with a transient one, which is noise rather than feedback.

  // D98: locked values are authoritative, not a display substitution. Derived at render rather
  // than synchronised through an effect — there is no divergence to sync if every read goes
  // through the same merge. Previously the panel displayed a locked 8 while `params` kept 6 and
  // doGenerate posted the 6, which caused 11 observed generation failures.
  const effectiveParams = reconcileLockedParams(params, constraints.lockedParams) ?? params;

  // Pre-generation credit estimate. Reads effectiveParams, NOT params — for the same reason
  // doGenerate does. A rule can pin duration to 8s while `params.duration` still holds the 6 the
  // operator last picked, and estimating off the stale 6 would quote one price and bill another.
  const durationSeconds = Number(effectiveParams.seconds ?? effectiveParams.duration ?? 0);
  const audioEnabled = isVideoAudioEnabled(effectiveParams.audio);
  const resolution = asResolutionString(effectiveParams.resolution);
  const videoCostEstimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
  const estimatedCredits = videoCostEstimate ? usdToFinalCredits(videoCostEstimate.usd) : null;

  // D95: the duration label the current combination actually yields — read off the model's own
  // param spec so it stays correct when a spec changes (e.g. O1's 5/10 select), but a rule-locked
  // value overrides the menu. Veo pins 8s the moment a reference image is used, and the spine
  // advertising "4 or 6 or 8s" contradicted the greyed-out 4 and 6 in the panel below it.
  const durationSpec = currentModel?.params.find((p) => p.name === "duration");
  const lockedDuration = constraints.lockedParams.duration;

  const spineModel = describeShotSpine({
    imageInputs,
    hasStartFrame: Object.values(effectiveImageRoles).includes("start_frame"),
    hasEndFrame: Object.values(effectiveImageRoles).includes("end_frame"),
    referenceCount: Object.values(effectiveImageRoles).filter((r) => r === "reference").length,
    durationLabel: describeDurationLabel(durationSpec, lockedDuration),
    framesRefsExclusive: areFramesAndRefsExclusive(currentModel?.rules),
    durationLockReason:
      lockedDuration !== undefined ? constraints.lockedParamReasons.duration : undefined,
  });

  const mode: "skeleton" | "result" | "empty" = isGenerating
    ? "skeleton"
    : videoUrl
      ? "result"
      : "empty";

  // ── Rail: connected items + selection (mirrors image-gen-focus-view) ─────────
  const connectedItems: { id: string; type: "prompt" | "image"; label: string }[] = [
    ...(promptNode ? [{ id: promptNode.id, type: "prompt" as const, label: "Motion prompt" }] : []),
    ...upstreamImages.map((img) => ({
      id: img.id,
      type: "image" as const,
      label: img.filename || "Image",
    })),
  ];
  const connectedCount = connectedItems.length;
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-auto gap-1.5 border-0 p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
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
                  {/* Usage popover needs versions, which are still loading right after the
                      sheet opens — reserve its space with a skeleton instead of popping it
                      in once the fetch resolves. */}
                  {loadingVersions ? (
                    <Skeleton className="h-8 w-20 rounded-md" />
                  ) : (
                    /* Always rendered once loaded — pre-generation it reads "0 credits used". */
                    <VideoGenUsagePopover
                      versions={versions}
                      nodeId={nodeId}
                      upstreamNodeIds={[
                        ...(promptNode ? [promptNode.id] : []),
                        ...upstreamImages.map((u) => u.id),
                      ]}
                    />
                  )}
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
                onConnected={() => void persistThenRefresh()}
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
                    onRemove={
                      editable ? () => void handleDisconnect(c.id) : undefined
                    }
                    removeLabel={`Disconnect ${c.label}`}
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
          {/* No overflow-hidden: it would crop the raised column's left shadow.
              The columns inside own their scrolling. */}
          <div className="flex min-h-0 flex-1">
            {/* Middle column */}
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {/* Video — flat, independently-collapsible peer groups (Frames / Output / Fine-tune / Advanced) */}
              {selected === "video" && (
                <div className="flex flex-col gap-10 px-6 py-5">
                  {/* Model first: it decides which roles exist, which params show, and which
                      combinations are legal, so every choice below it is downstream of this one. */}
                  {/* Output settings share the model's card: resolution and duration are
                      properties OF the chosen model — its options, its locks — so a separate
                      "Output settings" heading split one decision across two places. */}
                  <VideoGenModelPicker modelId={modelId} onModelChange={handleModelChange}>
                    <VideoGenParamsPanel
                      modelId={modelId}
                      params={effectiveParams}
                      onParamChange={handleParamChange}
                      lockedParams={constraints.lockedParams}
                      lockedParamReasons={constraints.lockedParamReasons}
                      group="primary"
                    />
                  </VideoGenModelPicker>
                  {(() => {
                    return (
                      <>
                        {/* The spine heads the Frames section: it is the summary of exactly what
                            the thumbnails below assign. Rendered unconditionally — D95 wants the
                            empty slots visible AT REST, and gating on connected images would hide
                            the shape of the shot precisely when nothing has been set up yet. */}
                        <LeftSection icon={ImageIcon} label="Frames">
                          <div className="flex flex-col gap-4">
                            <VideoGenShotSpine model={spineModel} />
                            <VideoGenConnectedSection
                              promptNode={null}
                              images={upstreamImages}
                              imageRoles={effectiveImageRoles}
                              imageInputs={imageInputs}
                              onRoleChange={handleRoleChange}
                              onOpenDetail={(id) => setSelected(id)}
                              disableFrameInputs={constraints.disableFrameInputs}
                              disableRefs={constraints.disableRefs}
                              onReset={handleReset}
                            />
                          </div>
                        </LeftSection>
                      </>
                    );
                  })()}

                  {/* Generate closes the column, after every setting it depends on —
                      it used to sit in the page header, far from the controls that
                      decide what it will cost and whether it is even legal to run. */}
                  <div className="border-t border-border pt-4">
                    <Tooltip>
                      <TooltipTrigger render={<span className="block w-full" />}>
                        <Button
                          size="lg"
                          className="w-full"
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
                          {!isGenerating && estimatedCredits !== null && (
                            <EstimatedCreditsLabel credits={estimatedCredits} />
                          )}
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
                <div className="flex flex-col gap-6 px-6 py-5">
                  {/* R10.1. Under Details, in a "Review" section — the same place and the
                      same shape image-gen uses. Sign-off must sit in one predictable spot
                      across node types, or a reviewer has to re-learn the layout per
                      asset. */}
                  <LeftSection icon={BadgeCheck} label="Review">
                    {/* Skeleton while the versions request is in flight. Without it this
                        showed "Generate a video first…" — a definite, wrong answer — and
                        then snapped to the approval control when the fetch landed. Saying
                        nothing is loaded yet beats saying the wrong thing confidently. */}
                    {loadingVersions ? (
                      <ApprovalSkeleton />
                    ) : activeVersionId ? (
                      <InlineApprovalBar
                        status={approvalStatus}
                        note={approvalNote}
                        approvedByName={approvedByName}
                        approvedAt={approvedAt}
                        saving={approvalSaving}
                        // R7.1/D160: not gated on `editable` — approval writes only to
                        // node_versions, outside what the D33 lock serialises.
                        canApprove={identity?.role === "senior"}
                        onSet={saveApproval}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Generate a video first to review and approve it.
                      </p>
                    )}
                  </LeftSection>
                  <ActiveRulesCard constraints={constraints} />
                </div>
              )}
            </div>

            {/* Right column — the video, always visible. Faintly sunk so the
                settings column reads as raised against it. */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/20 px-6 py-5">
              <div className="flex items-center gap-1.5">
                <Clapperboard className="size-3.5 text-primary" strokeWidth={1.5} />
                <span className="text-eyebrow">Video</span>
              </div>
              <div className="min-h-0 flex-1">
                {mode === "skeleton" && (
                  // 9:16, flush left — the same footprint the result frame will occupy.
                  <div className="aspect-[9/16] h-full max-w-full animate-pulse rounded-xl bg-muted-foreground/15" />
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
                  // Height-driven 9:16 frame, flush left — same treatment as the
                  // image-gen result: the border hugs the video instead of a
                  // width-forced box painting gutters inside it.
                  <video
                    src={videoUrl}
                    controls
                    className="aspect-[9/16] h-full max-w-full rounded-xl border border-border bg-muted/20"
                  />
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

          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
