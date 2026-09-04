"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  History,
  ImageIcon,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import {
  ConnectedDetailView,
  NodeIcon,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import { AddConnection } from "./add-connection";
import {
  ImageGenVersionHistory,
  type ImageGenVersionSummary,
} from "./image-gen-version-history";
import { ImageGenUsagePopover } from "./image-gen-usage-popover";
import { ImageGenEditPanel } from "./image-gen-edit-panel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ImageGenAnnotationCanvas,
  type AnnotationHandle,
} from "./image-gen-annotation-canvas";
import {
  ImageGenEditReferences,
  type EditReferenceItem,
} from "./image-gen-edit-references";
import {
  buildEditPrompt,
  selectEditReferenceUrls,
  resolveBaseNodeId,
  type EditIntent,
} from "@/lib/image-gen/edit-prompt";
import type { MentionUpstream } from "@/lib/nodes/resolve-mention-tokens";
import { editModeForModel } from "@/lib/image-gen/edit-mode";
import { InlineEvalBar } from "./inline-eval-bar";
import { InlineApprovalBar } from "./inline-approval-bar";
import { ApprovalSkeleton } from "./approval-skeleton";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { setVersionLabelAction } from "@/lib/actions/eval";
import {
  setVersionApprovalAction,
  markVersionApprovalSeenAction,
} from "@/lib/actions/approval";
import { useIdentity } from "@/hooks/use-identity";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import { revalidateCanvasGenerations } from "@/hooks/use-canvas-generations";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import type { ApprovalStatus } from "@/lib/approval";
import {
  imageGenClientModelMap,
  DEFAULT_CLIENT_MODEL_ID,
  defaultsForModel,
} from "@/lib/image-gen/client-models";
import { smartMergeParams } from "@/lib/image-gen/params/merge";
import { paramsForRestore } from "@/lib/generations/version-params";
import { ImageGenOutputSettingsBody } from "./image-gen-output-settings-body";
import {
  validateReferenceImages,
  type RefImageMeta,
} from "@/lib/image-gen/validate";
import { ApprovalStatusBadge } from "@/components/review/approval-status-badge";
import { ReviewAnnotationCanvas } from "@/components/review-annotations/review-annotation-canvas";
import { AnnotationPin } from "@/components/review-annotations/annotation-pin";
import { AnnotationNotePopover } from "@/components/review-annotations/annotation-note-popover";
import { AnnotationList } from "@/components/review-annotations/annotation-list";
import { useAnnotationDrafts } from "@/components/review-annotations/use-annotation-drafts";
import {
  DiscardAnnotationsDialog,
  useDiscardAnnotationsConfirm,
} from "@/components/review-annotations/discard-annotations-dialog";
import { groupByTimecode } from "@/lib/review-annotations/group";
import type { RegionBounds } from "@/lib/review-annotations/draft";
import { CREDIT_LIMIT_TOAST_MESSAGE, usdToFinalCredits } from "@/lib/credits/units";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { LeftSection } from "./focus-left-section";
import { RailItem } from "./focus-rail-item";
import { Skeleton } from "@/components/ui/skeleton";

export type ImageGenFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  canvasName?: string;
  scriptTitle?: string;
  imageUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  editInstruction?: string;
  editIntent?: EditIntent;
  editReferenceNodeIds?: string[];
  baseReferenceNodeId?: string;
  upstream: Array<{
    id: string;
    type: string;
    fileUrl?: string;
    fileKind?: string;
    fileSizeBytes?: number;
    imageWidth?: number;
    imageHeight?: number;
  }>;
  onPatch: (patch: Record<string, unknown>) => void;
  /** Mirrors in-flight generate/edit state up to the node so its card can show
   *  a Processing pill even while the focus view is closed. */
  onProcessingChange?: (v: boolean) => void;
};

type ParamFormValues = Record<string, unknown>;

// ── Main focus view ───────────────────────────────────────────────────────────

export function ImageGenFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  canvasName,
  scriptTitle,
  imageUrl,
  modelId,
  params,
  editInstruction,
  editIntent,
  editReferenceNodeIds,
  baseReferenceNodeId,
  upstream,
  onPatch,
  onProcessingChange,
}: ImageGenFocusViewProps) {
  const selectedModelId = modelId ?? DEFAULT_CLIENT_MODEL_ID;
  const model =
    imageGenClientModelMap[selectedModelId] ??
    imageGenClientModelMap[DEFAULT_CLIENT_MODEL_ID];
  const editMode = editModeForModel(model.supportsMask); // "paint" | "type"

  const [paramValues, setParamValues] = useState<ParamFormValues>(() => {
    const base = { ...defaultsForModel(model), ...(params ?? {}) };
    // Migrate legacy pixel-size params to unified aspect_ratio (one-time at mount).
    if (base.size && !base.aspect_ratio) {
      const SIZE_TO_RATIO: Record<string, string> = {
        "1024x1024": "1:1",
        "1536x1024": "16:9",
        "1024x1536": "9:16",
        auto: "1:1",
      };
      base.aspect_ratio = SIZE_TO_RATIO[base.size as string] ?? "1:1";
      delete base.size;
    }
    // Persisted params can hold a value this model no longer offers — a node saved while an
    // option was still listed, or one whose model spec has since dropped it (gemini-2.5-flash-image
    // and 4:1). Spreading it through unchecked leaves the node sending a value the provider
    // 400s on, with no way out of the Select. Same merge the model-switch effect uses.
    return smartMergeParams(base, model);
  });

  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Mirror in-flight state up to the node card (survives focus-view close).
  useEffect(() => {
    onProcessingChange?.(generating || editing);
  }, [generating, editing, onProcessingChange]);
  const [editInstr, setEditInstr] = useState(editInstruction ?? "");
  const [intent, setIntent] = useState<EditIntent>(editIntent ?? "freeform");
  const [activeTab, setActiveTab] = useState<"generate" | "edit">("generate");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>(
    editReferenceNodeIds ?? []
  );
  const [hasMaskRegion, setHasMaskRegion] = useState(false);
  const annotationRef = useRef<AnnotationHandle>(null);
  // D213 review annotations - a separate canvas from edit mode's (`annotationRef`),
  // living on the RESULT image rather than the edit base, with its own drafts.
  const [reviewAnnotating, setReviewAnnotating] = useState(false);
  const [pendingBounds, setPendingBounds] = useState<RegionBounds | null>(null);
  const reviewCanvasRef = useRef<AnnotationHandle>(null);
  const reviewDrafts = useAnnotationDrafts();
  const discardConfirm = useDiscardAnnotationsConfirm();
  // null = follow the per-intent template; a string = the operator's hand-edited final prompt.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [versions, setVersions] = useState<ImageGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [evalDecision, setEvalDecision] = useState<"pass" | "fail" | null>(
    null
  );
  const [evalNote, setEvalNote] = useState("");
  const [evalSaving, setEvalSaving] = useState(false);
  // D29 approval flag — sibling of the eval signal, distinct field.
  const [approvalStatus, setApprovalStatus] =
    useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const { identity } = useIdentity();
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const [fetchedPrompt, setFetchedPrompt] = useState<{
    nodeId: string;
    text: string;
  } | null>(null);
  // estimatedCredits/editEstimatedCredits are computed directly below (D93) — no state, no
  // fetch. See the useMemo blocks further down for both.
  // Seeded from `open`, not `false`. These flags are armed inside the open-TRANSITION
  // block below, so any path that mounts this view ALREADY open skips them and every
  // skeleton stays off through the first fetch.
  //
  // Both branches hit this independently: the guided button creates a node with its focus
  // view already open (see video-prompt-focus-view.tsx), and a navbar-inbox review link
  // does the same. The visible symptom differed — an empty prompt panel there, "Generate
  // an image first…" snapping to the approval control here — but it is one bug.
  const [loadingVersions, setLoadingVersions] = useState(open);
  // Mirrors the re-arm's own condition exactly: only arm when there IS a prompt to fetch.
  // The effect that clears this flag returns early when none is connected, so arming it
  // unconditionally would strand the skeleton on forever.
  const [loadingPreview, setLoadingPreview] = useState(
    () => open && upstream.some((u) => u.type === "prompt"),
  );
  // The selected rail item: "image" (the hero pane), "history", "details", or a
  // connected node's id (right pane shows that node's read-only detail).
  const focusStoreApi = useCanvasStoreApi();
  // Initialised from the store, not just updated on the open TRANSITION: arriving from a
  // navbar-inbox link can mount this view already open, in which case the transition never
  // fires and the requested section would be lost.
  const [selected, setSelected] = useState<string>(
    () => (open ? focusStoreApi.getState().focusSection : null) ?? "image",
  );
  const [openSeed, setOpenSeed] = useState(open);
  const seenModelIdRef = useRef(model.id);

  // Re-arm skeletons on open transition.
  if (open !== openSeed) {
    setOpenSeed(open);
    if (open) {
      setLoadingVersions(true);
      // Only arm the preview skeleton if there's actually a prompt node to fetch.
      setLoadingPreview(upstream.some((u) => u.type === "prompt"));
      // Normally the hero pane — but a programmatic open from the review drawer or the
      // navbar inbox asks for "details", where sign-off lives. Landing on the hero pane
      // would make a reviewer hunt for the control they were sent here to use.
      setSelected(focusStoreApi.getState().focusSection ?? "image");
    }
  }

  // Clear the one-shot section request once this view has consumed it, so opening any
  // other node afterwards goes to its own default. Guarded on `open`, so the many closed
  // focus views mounted across the canvas never clear a request meant for one of them.
  useEffect(() => {
    if (open) focusStoreApi.getState().setFocusSection(null);
  }, [open, focusStoreApi]);

  // A connected node is selected when `selected` isn't one of the fixed rail keys.
  const isNodeSelected = !["image", "history", "details"].includes(selected);

  useEffect(() => {
    if (model.id !== seenModelIdRef.current) {
      seenModelIdRef.current = model.id;
      const merged = smartMergeParams(paramValues, model);
      setParamValues(merged);
      onPatch({ params: merged });
      annotationRef.current?.clear(); // drop any painted mask — it must not cross models
      setHasMaskRegion(false);
      // The hand-edited override can still carry the masked-region sentence baked in from
      // before the switch (YUV-287) — clear it so finalPrompt re-derives from the template,
      // same as handlePickChip/handleInstructionChange already do for other invalidations.
      setPromptOverride(null);
    }
    // NOTE: paramValues is intentionally excluded from the dep array — we only
    // want this effect to fire when the model changes, not on every param edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, onPatch]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/versions`);
        if (!cancelled && res.ok) {
          const json = (await res.json()) as {
            activeVersionId: string | null;
            versions: ImageGenVersionSummary[];
          };
          setVersions(json.versions ?? []);
          setActiveVersionId(json.activeVersionId ?? null);
          const active = (json.versions ?? []).find(
            (v) => v.id === json.activeVersionId
          );
          setEvalDecision(active?.decision ?? null);
          setEvalNote(active?.note ?? "");
          setApprovalStatus(active?.approvalStatus ?? "pending");
          setApprovalNote(active?.note ?? "");
          setApprovedByName(active?.approvedByName ?? null);
          setApprovedAt(active?.approvedAt ?? null);
        }
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setLoadingVersions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const promptNode = upstream.find((u) => u.type === "prompt");
    if (!promptNode) return;
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${promptNode.id}/versions`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          activeVersionId: string | null;
          versions: Array<{ id: string; output: string | null }>;
        };
        const active = (json.versions ?? []).find(
          (v) => v.id === json.activeVersionId
        );
        if (!cancelled && active?.output) {
          setFetchedPrompt({ nodeId: promptNode.id, text: active.output });
        }
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, upstream]);

  const promptUpstream = upstream.find((u) => u.type === "prompt");
  const referenceCount = upstream.filter((u) => {
    if (u.type === "image-gen") return true;
    if (u.type === "file") return u.fileKind === "image" && !!u.fileUrl;
    if (u.type === "draw") return !!u.fileUrl;
    return false;
  }).length;

  // ── Edit-this-image derived values ──────────────────────────────────────────
  // Connected image URLs (file/draw/image-gen all expose fileUrl in `upstream`).
  const connectedImageUrls = upstream
    .filter(
      (u) =>
        (u.type === "file" || u.type === "draw" || u.type === "image-gen") &&
        !!u.fileUrl
    )
    .map((u) => u.fileUrl as string);
  const firstConnectedImageUrl = connectedImageUrls[0];
  // Stable primitive for the effect's dep array — connectedImageUrls itself is a new array
  // reference every render (derived, not stored in state).
  const connectedImageUrlsKey = JSON.stringify(connectedImageUrls);

  // Pre-generation cost estimate — a synchronous local computation (D93), not a fetch to our
  // own API route. The previous fetch-based version still paid a real DB+auth round trip on
  // every param change (withNode's node/canvas/client lookup in the now-deleted
  // image-generate/estimate route) even after D92 removed the live vendor token-counting
  // call — this eliminates that hop entirely, matching video-gen's computeVideoCost (called
  // directly in render, no fetch at all). Only meaningful on the Generate tab (Edit has its
  // own action button, out of scope per this plan) and once there's a prompt to estimate from.
  const hasPromptUpstream = Boolean(promptUpstream);
  const paramValuesKey = JSON.stringify(paramValues);
  const estimatedCredits = useMemo(() => {
    if (!open || activeTab === "edit" || !promptUpstream || !fetchedPrompt?.text) return null;
    const costUsd = estimateImageGenerationCostUsd({
      modelId: model.id,
      quality: paramValues.quality as string | undefined,
      aspectRatio: paramValues.aspect_ratio as string | undefined,
      imageSize: paramValues.image_size as string | undefined,
      referenceUrls: connectedImageUrls,
    });
    return costUsd === null ? null : usdToFinalCredits(costUsd);
    // paramValues/connectedImageUrls omitted on purpose — each is a new object/array
    // reference on renders that don't actually change its contents; stable JSON-stringified/
    // primitive stand-ins (hasPromptUpstream, paramValuesKey, connectedImageUrlsKey) avoid
    // recomputing on every unrelated re-render, same rationale this effect (now a memo) has
    // always used — extracted into named variables since react-hooks/use-memo requires
    // simple dependency expressions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeTab,
    hasPromptUpstream,
    selectedModelId,
    paramValuesKey,
    connectedImageUrlsKey,
    fetchedPrompt?.text,
  ]);
  // The connected prompt node's output (fetched by the separate effect above) hasn't loaded
  // yet — the Generate button stays disabled/spinning for that, independent of the now-
  // synchronous cost estimate above.
  const estimating =
    open && activeTab !== "edit" && Boolean(promptUpstream) && !fetchedPrompt?.text;

  // Connected image NODES (id + url), for the edit-mode reference tiles.
  const connectedImageNodes = upstream
    .filter(
      (u) =>
        (u.type === "file" || u.type === "draw" || u.type === "image-gen") &&
        !!u.fileUrl
    )
    .map((u) => ({ id: u.id, url: u.fileUrl as string, type: u.type }));

  // Base = the node's current image: the active attempt if present, else a connected image.
  const baseIsAttempt = Boolean(activeVersionId);
  const canEditBase = baseIsAttempt || Boolean(firstConnectedImageUrl);

  // D39: which connected image is the base — the operator's explicit pick if still connected,
  // else the first connected image (attempt always wins → null; caller uses the attempt's URL).
  const baseNodeId = resolveBaseNodeId({
    connected: connectedImageNodes,
    baseReferenceNodeId,
    hasAttempt: baseIsAttempt,
  });
  const baseNodeUrl =
    connectedImageNodes.find((n) => n.id === baseNodeId)?.url ?? null;

  // Base image shown/annotated in Edit mode: the active attempt, else the pinned/first connected.
  // The annotation canvas is keyed on this url, so a new base remounts it with a blank overlay
  // — marks never carry over onto a freshly generated image.
  const editBaseUrl = imageUrl ?? baseNodeUrl ?? null;

  // Validation for reference image limits
  const refMetas: RefImageMeta[] = upstream
    .filter(
      (u) =>
        (u.type === "file" || u.type === "draw" || u.type === "image-gen") &&
        !!u.fileUrl
    )
    .map((u) => ({
      url: u.fileUrl!,
      fileSizeBytes: u.fileSizeBytes,
      imageWidth: u.imageWidth,
      imageHeight: u.imageHeight,
    }));

  const refValidation = validateReferenceImages(refMetas, model);
  const refViolationsByUrl = new Map(
    refValidation.ok
      ? []
      : refValidation.violations.map((v) => [v.url, v.message])
  );

  const referenceItems: EditReferenceItem[] = connectedImageNodes.map((n) => ({
    id: n.id,
    url: n.url,
    label:
      n.type === "draw"
        ? "Sketch"
        : n.type === "image-gen"
        ? "Image reference"
        : "Image file",
    isBase: n.id === baseNodeId,
    violation: refViolationsByUrl.get(n.url),
  }));

  // Extras = the connected image nodes the user ticked (base excluded). Selection is explicit
  // (D101): tick nothing and the edit sees only the base image — no silent "all connected".
  const selectedExtraUrls = selectEditReferenceUrls({
    connected: connectedImageNodes,
    selectedIds: selectedRefIds,
    baseUrl: editBaseUrl ?? undefined,
  });
  const hasExtraReference = selectedExtraUrls.length > 0;

  // Final prompt = the per-intent template, unless the operator has hand-edited it (override).
  // Picking a chip or changing the instruction clears the override so the template re-derives.
  const mentionUpstreamForEdit: MentionUpstream[] = upstream.map((u) => ({
    nodeId: u.id,
    type: u.type,
    text: "",
    fileUrl: u.fileUrl,
    fileKind: u.fileKind,
  }));

  const composedPrompt = editInstr.trim()
    ? buildEditPrompt({
        instruction: editInstr,
        intent,
        hasExtraReference,
        masked: editMode === "paint" && hasMaskRegion,
        upstream: mentionUpstreamForEdit,
      })
    : "";
  const finalPrompt = promptOverride ?? composedPrompt;
  const referenceWarning =
    (intent === "replace" || intent === "add") && !hasExtraReference;
  const suggestGemini = model.provider !== "gemini";

  const editReferenceUrlsKey = JSON.stringify([editBaseUrl, ...selectedExtraUrls]);

  // Pre-generation cost estimate for the Edit tab — same synchronous local computation as the
  // Generate-tab estimate above (D93), keyed off the edit flow's own inputs (the same
  // prompt/references handleEdit() itself sends), since editing reserves and charges credits
  // the same way generating does. Reference-URL approximation matches the Generate estimate's
  // own precedent: this passes the raw base+extras list, not assembleEditReferences()'s
  // post-max-count/dedup list the real route actually reserves against — an existing,
  // accepted gap between estimate and reservation, kept consistent rather than special-cased.
  const editEstimatedCredits = useMemo(() => {
    if (!open || activeTab !== "edit" || !canEditBase || !finalPrompt.trim()) return null;
    const referenceUrls = [editBaseUrl, ...selectedExtraUrls].filter(
      (u): u is string => Boolean(u),
    );
    const costUsd = estimateImageGenerationCostUsd({
      modelId: model.id,
      quality: paramValues.quality as string | undefined,
      aspectRatio: paramValues.aspect_ratio as string | undefined,
      imageSize: paramValues.image_size as string | undefined,
      referenceUrls,
    });
    return costUsd === null ? null : usdToFinalCredits(costUsd);
    // paramValuesKey stands in for paramValues (an object), same reason as the Generate
    // estimate above — a stable primitive avoids recomputing on renders that don't actually
    // change its contents, and react-hooks/use-memo requires a simple dependency expression.
    // finalPrompt is already a string primitive, so it's used directly with no stand-in needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeTab,
    canEditBase,
    selectedModelId,
    paramValuesKey,
    finalPrompt,
    editReferenceUrlsKey,
  ]);
  // No async dependency left on this tab (finalPrompt/canEditBase are already synchronously
  // known, unlike the Generate tab's connected-prompt fetch) — nothing to show a loading
  // state for.
  const editEstimating = false;

  const upstreamForCard: UpstreamNode[] = useMemo(
    () =>
      upstream.map((u) => {
        const typeLabel =
          u.type === "prompt"
            ? "Image prompt"
            : u.type === "image-gen"
            ? "Image reference"
            : u.type === "draw"
            ? "Sketch"
            : u.type === "file"
            ? "Image file"
            : u.type;
        return {
          id: u.id,
          label: typeLabel,
          type: u.type,
          fileUrl: u.fileUrl,
          fileKind: u.fileKind,
        };
      }),
    [upstream]
  );

  // One preview per upstream node so every rail item has a detail view: the
  // connected prompt gets its fetched active output, image inputs their fileUrl.
  const connectedPreviews = useMemo<ConnectedPreview[]>(
    () =>
      upstreamForCard.map((u) => ({
        nodeId: u.id,
        type: u.type,
        label: u.label,
        text:
          u.type === "prompt" && fetchedPrompt?.nodeId === u.id
            ? fetchedPrompt.text
            : "",
        fileUrl: u.fileUrl,
        fileKind: u.fileKind,
      })),
    [upstreamForCard, fetchedPrompt]
  );

  const selectedNode = isNodeSelected
    ? connectedPreviews.find((c) => c.nodeId === selected) ?? null
    : null;
  // The prompt's text arrives async — show the loading fallback until it lands.
  const selectedNodeReady =
    !!selectedNode &&
    !(
      selectedNode.type === "prompt" &&
      !selectedNode.text.trim() &&
      loadingPreview
    );

  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : imageUrl
    ? "result"
    : "empty";

  // `preserveEvalDraft` exists for the live-refresh path only — see useNodeVersionUpdates
  // below. Every other caller is reacting to the viewer's OWN action (generate, restore,
  // decide), where re-seeding from the server is the point.
  // Returns the now-active version's approval status so callers that changed WHICH version
  // is active (restore) can push it into the store — see handleRestoreVersion.
  async function fetchVersions(opts?: {
    preserveEvalDraft?: boolean;
  }): Promise<ApprovalStatus | undefined> {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        activeVersionId: string | null;
        versions: ImageGenVersionSummary[];
      };
      setVersions(json.versions ?? []);
      setActiveVersionId(json.activeVersionId ?? null);
      const active = (json.versions ?? []).find(
        (v) => v.id === json.activeVersionId
      );
      setEvalDecision(active?.decision ?? null);
      // The eval note is a CONTROLLED draft saved on blur, so re-seeding it mid-keystroke
      // discards whatever the viewer was typing. Harmless when they triggered the refresh
      // themselves; a silent loss when someone else's decision triggered it.
      if (!opts?.preserveEvalDraft) setEvalNote(active?.note ?? "");
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
      setApprovedByName(active?.approvedByName ?? null);
      setApprovedAt(active?.approvedAt ?? null);
      return active?.approvalStatus ?? "pending";
    } catch {
      /* best-effort */
    }
  }

  // D179: keep this panel live while it is open. Someone else approving, rejecting or
  // regenerating THIS node refreshes it in place — the decision thread, the status icons
  // and the rail badge all read from `versions`, so re-reading it re-syncs every one.
  useNodeVersionUpdates(nodeId, open, () => {
    void fetchVersions({ preserveEvalDraft: true });
  });

  async function handleGenerate() {
    // Second line of defence behind the button's disabled state: a run in flight must never
    // be able to start another one. The disabled prop alone lives in a sibling component and
    // has already been lost once to an unrelated tooltip edit — this guard is next to the
    // request it protects, and covers any future caller that isn't that button.
    if (generating || editing) return;
    if (!promptUpstream) {
      toast.error("Connect a Prompt node first.");
      return;
    }
    setGenerating(true);
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const values = paramValues;
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, params: values }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        versionId?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl)
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      // Tell the Gallery Drawer's Canvas Generations tab about the image we just made. The
      // route has already committed the succeeded generation by the time it answers us, so
      // this is the reliable signal — the drawer can be sitting open next to this focus view.
      void revalidateCanvasGenerations();
      toast.success("Image generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }

  function handlePickChip(nextIntent: EditIntent, starter: string) {
    setIntent(nextIntent);
    setPromptOverride(null); // re-derive the final prompt for the new action
    if (!editInstr.trim()) {
      setEditInstr(starter);
      onPatch({ editIntent: nextIntent, editInstruction: starter });
    } else {
      onPatch({ editIntent: nextIntent });
    }
  }

  function handleToggleRef(id: string) {
    // Compute + persist in the event body — never inside the setState updater,
    // which React runs during render (a store write there updates GenerationTray
    // mid-render → "cannot update a component while rendering a different one").
    const next = selectedRefIds.includes(id)
      ? selectedRefIds.filter((x) => x !== id)
      : [...selectedRefIds, id];
    setSelectedRefIds(next);
    onPatch({ editReferenceNodeIds: next });
  }

  // D39: pin a connected image as the edit base. The previous base rejoins the selectable
  // extras; the new base is excluded from them (via editBaseUrl in selectEditReferenceUrls).
  function handleSetBase(id: string) {
    onPatch({ baseReferenceNodeId: id });
  }

  function handleInstructionChange(v: string) {
    setEditInstr(v);
    setPromptOverride(null); // re-derive from the template as the instruction changes
  }

  function handleInstructionBlur() {
    onPatch({ editInstruction: editInstr });
  }

  async function handleEdit() {
    if (editing || generating) return; // same re-entrancy guard as handleGenerate
    const baseVersionId = activeVersionId ?? undefined;
    const baseImageUrl = baseVersionId ? undefined : baseNodeUrl ?? undefined;
    if (!baseVersionId && !baseImageUrl) {
      toast.error(
        "Generate an image, or connect an image reference, to edit it."
      );
      return;
    }
    setEditing(true);
    setLastError(null);
    try {
      // Region mask (paint models only): convert the painted overlay into an alpha PNG and send
      // it alongside the CLEAN base. Type-only models send no mask.
      let maskBase64: string | undefined;
      let maskMime: string | undefined;
      if (editMode === "paint" && annotationRef.current?.hasMarks()) {
        const mask = await annotationRef.current.toMaskBase64();
        if (mask) {
          maskBase64 = mask.base64;
          maskMime = mask.mime;
        }
      }
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          params: paramValues,
          instruction: editInstr,
          intent,
          prompt: finalPrompt,
          extraReferenceUrls: selectedExtraUrls,
          ...(maskBase64 ? { masked: true, maskBase64, maskMime } : {}),
          ...(baseVersionId ? { baseVersionId } : { baseImageUrl }),
        }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        versionId?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl)
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Edit failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      annotationRef.current?.clear();
      await fetchVersions();
      void revalidateCanvasGenerations(); // same as handleGenerate — an edit is a generation too
      toast.success("Image edited");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Edit failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    } finally {
      setEditing(false);
    }
  }

  /**
   * Put the node back into the state that produced this version — its model and its params,
   * not only its image (YUV-295).
   *
   * Restoring used to write `parsed` alone, so v1's image sat under whatever model and quality
   * happened to be set, and the very next Generate silently used those instead of the ones the
   * operator had just chosen to go back to.
   *
   * `seenModelIdRef` is moved forward BEFORE the patch on purpose: the model-change effect
   * above exists to migrate params when the OPERATOR switches models, and smartMergeParams
   * resets anything that isn't a select/slider to the new model's defaults. A restore already
   * carries the exact params that model ran with, so letting that migration fire would undo
   * the restore it was reacting to.
   */
  async function handleRestoreVersion(versionId: string) {
    setRestoring(true);
    // One toast for the whole gesture — the id below swaps this spinner in place rather than
    // stacking a second toast. Restore is two round trips (the POST, then the refetch).
    const toastId = toast.loading("Restoring version…");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/restore-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const json = (await res.json()) as {
        output?: string;
        modelUsed?: string | null;
        paramsUsed?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Restore failed");
      // params_used carries its own modelId for image versions (the image-generate route writes
      // it there); model_used is the same value, and the fallback covers either being absent.
      const restoredModelId =
        (typeof json.paramsUsed?.modelId === "string" ? json.paramsUsed.modelId : null) ??
        json.modelUsed ??
        null;
      const restoredParams = restoredModelId
        ? paramsForRestore(imageGenClientModelMap[restoredModelId]?.params, json.paramsUsed ?? {})
        : null;
      if (restoredModelId && restoredParams) {
        seenModelIdRef.current = restoredModelId;
        setParamValues(restoredParams);
        onPatch({
          ...(json.output ? { parsed: json.output } : {}),
          modelId: restoredModelId,
          params: restoredParams,
        });
      } else if (json.output) {
        onPatch({ parsed: json.output });
      }
      setActiveVersionId(versionId);
      setHasMaskRegion(false); // restored a different base — drop any stale mask-region flag
      // The restored version carries its OWN approval state (D29 reads the badge off the
      // ACTIVE version), so the on-canvas badge has to move with the pointer. Without this
      // it kept showing the previously-active version's status — TC-106.
      const restoredStatus = await fetchVersions();
      onPatch({ approvalStatus: restoredStatus ?? "pending" });
      toast.success(
        restoredParams
          ? "Version restored — model and settings applied"
          : "Image restored — its settings are no longer available",
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", { id: toastId });
    } finally {
      setRestoring(false);
    }
  }

  async function handleEvalDecision(d: "pass" | "fail" | null) {
    if (!activeVersionId) return;
    setEvalDecision(d);
    setEvalSaving(true);
    try {
      await setVersionLabelAction(activeVersionId, {
        decision: d,
        note: evalNote.trim() || null,
      });
      toast.success("Feedback saved");
    } catch {
      toast.error("Failed to save feedback");
    } finally {
      setEvalSaving(false);
    }
  }

  async function handleEvalNoteBlur() {
    if (!activeVersionId || evalDecision === null) return;
    setEvalSaving(true);
    try {
      await setVersionLabelAction(activeVersionId, {
        decision: evalDecision,
        note: evalNote.trim() || null,
      });
    } catch {
      toast.error("Failed to save note");
    } finally {
      setEvalSaving(false);
    }
  }

  async function saveApproval(status: ApprovalStatus, note: string | null) {
    if (!activeVersionId) return;
    setApprovalSaving(true);
    try {
      // D211/D212: drafts ride along with the rejection they belong to - one action, so
      // there is no window where a decision exists without its annotations. `bounds` is
      // client-only geometry for the pin; the server stores the overlay, not the box.
      const annotations =
        status === "changes_requested" && reviewDrafts.drafts.length > 0
          ? reviewDrafts.drafts.map(({ bounds: _bounds, ...payload }) => payload)
          : undefined;
      await setVersionApprovalAction(activeVersionId, { status, note, annotations });
      reviewDrafts.clear();
      setReviewAnnotating(false);
      setPendingBounds(null);
      setApprovalStatus(status);
      setApprovalNote(note ?? "");
      // Push into the store so the on-canvas badge refreshes immediately — without
      // this the badge stays stale until a full reload re-hydrates from the DB.
      onPatch({ approvalStatus: status });
      // Re-read the versions list: it is the ONLY source of the History panel's decision
      // thread, its status icons, and the reviewer name/time on the approval readout.
      // Without this the reviewer's own decision is invisible on the very screen they
      // made it on until they reopen the focus view (D173).
      await fetchVersions();
    } catch {
      toast.error("Failed to save approval");
    } finally {
      setApprovalSaving(false);
    }
  }

  function commitParams(values: ParamFormValues) {
    onPatch({ params: values });
  }

  function changeModel(nextId: string) {
    onPatch({ modelId: nextId });
  }

  async function handleDownload() {
    if (!imageUrl) return;
    try {
      const fetchUrl = imageUrl.startsWith("https://storage.googleapis.com/")
        ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
        : imageUrl;
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const slug = (s: string) => s.trim().replace(/\s+/g, "-").toLowerCase();
      const shortId = nodeId.slice(0, 8);
      const parts = [
        canvasName ? slug(canvasName) : null,
        scriptTitle ? slug(scriptTitle) : null,
        slug(title || "image"),
        shortId,
      ].filter(Boolean);
      const filename = `${parts.join("_")}.${ext}`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // fallback: open in new tab for manual save
      window.open(imageUrl, "_blank");
    }
  }

  const reviewBadge =
    mode === "result" ? <ApprovalStatusBadge status={approvalStatus} /> : undefined;

  const outputSettingsBody = (
    <ImageGenOutputSettingsBody
      model={model}
      values={paramValues}
      onValuesChange={setParamValues}
      onCommit={commitParams}
      onModelChange={changeModel}
      referenceCount={referenceCount}
      refValidation={refValidation}
      showGenerate={activeTab !== "edit"}
      onGenerate={handleGenerate}
      generating={generating}
      editing={editing}
      hasPrompt={Boolean(promptUpstream)}
      hasImage={Boolean(imageUrl)}
      estimatedCredits={estimatedCredits}
      estimating={estimating}
    />
  );

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
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  <EditableField
                    value={title || ""}
                    onCommit={(t) => onPatch({ title: normalizeTitle(t) })}
                    placeholder="Image generation"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* The Usage popover depends on the versions fetch that starts when the
                    sheet opens — reserve its space with a skeleton rather than letting it
                    pop into the header once the request resolves. The Generate/Edit toggle
                    used to sit here too; it now lives over the image it acts on. */}
                {loadingVersions ? (
                  <Skeleton className="h-8 w-28 rounded-lg" />
                ) : (
                  /* Always rendered — pre-generation it reads "0 credits used". */
                  <ImageGenUsagePopover
                    versions={versions}
                    nodeId={nodeId}
                    upstreamNodeIds={upstream.map((u) => u.id)}
                  />
                )}
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
            {lastError && !generating && !editing && (
              <div className="mt-2">
                <GenerationErrorBadge error={lastError} />
              </div>
            )}
          </div>
        </div>

        {/* Body: left rail + detail pane */}
        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          {/* Rail */}
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem
              icon={<ImageIcon className="size-4 text-primary" />}
              label="Image"
              active={selected === "image"}
              onClick={() => setSelected("image")}
            />

            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground/70">
                Connected · {upstream.length}
              </span>
              <AddConnection
                targetId={nodeId}
                targetType="image-gen"
                connectedIds={upstream.map((u) => u.id)}
              />
            </div>
            {upstream.length === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">
                No inputs connected.
              </p>
            ) : (
              upstreamForCard.map((u) => (
                <RailItem
                  key={u.id}
                  icon={<NodeIcon type={u.type} />}
                  label={u.label}
                  active={selected === u.id}
                  onClick={() => setSelected(u.id)}
                />
              ))
            )}

            <div className="mx-2.5 my-2 h-px bg-border" />
            <RailItem
              icon={<History className="size-4 text-primary" />}
              label="History"
              active={selected === "history"}
              onClick={() => setSelected("history")}
              badge={
                versions.length > 0 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {versions.length}
                  </span>
                ) : undefined
              }
            />
            <RailItem
              icon={<SlidersHorizontal className="size-4 text-primary" />}
              label="Details"
              active={selected === "details"}
              onClick={() => setSelected("details")}
              badge={reviewBadge}
            />
          </nav>

          {/* Detail pane: the middle column swaps with the rail selection; the
              output column on the right is ALWAYS visible, so the operator can
              look at refs, settings, or the prompt while watching the result. */}
          {/* No overflow-hidden: it would crop the raised column's left shadow.
              The columns inside own their scrolling. */}
          <div className="flex min-h-0 flex-1">
            {/* Middle column — the one the operator acts in, so it is the raised
                white surface: card background plus a sideways shadow against the
                muted output pane beside it. Deliberately NOT a purple wash — the
                design system reserves the brand colour for accents and forbids it
                as a large background fill, and a tinted column would also fight the
                purple CTA sitting inside it. */}
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {/* Image — model & controls; plus the edit tools on the Edit tab */}
              {selected === "image" && (
                <div className="flex flex-col gap-6 px-6 py-5">
                  {activeTab === "edit" ? (
                    // Edit tab: same output settings, collapsed into an accordion so
                    // the edit instructions get the room. Closed by default.
                    <Accordion>
                      <AccordionItem value="output" className="border-none">
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="flex items-center gap-1.5">
                            <Settings2
                              className="size-3.5 text-primary"
                              strokeWidth={1.5}
                            />
                            <span className="text-eyebrow">
                              Output settings
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-3">
                          {outputSettingsBody}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ) : (
                    // Flat, like the image-prompt compose column — the card emphasis
                    // belongs to the generated output on the right, not the controls.
                    <LeftSection icon={Settings2} label="Output settings">
                      {outputSettingsBody}
                    </LeftSection>
                  )}

                  {activeTab === "edit" && canEditBase && (
                    <>
                      <ImageGenEditReferences
                        items={referenceItems}
                        selectedIds={selectedRefIds}
                        onToggle={handleToggleRef}
                        onSetBase={handleSetBase}
                        canSetBase={!baseIsAttempt}
                      />
                      <ImageGenEditPanel
                        intent={intent}
                        instruction={editInstr}
                        upstream={upstreamForCard}
                        finalPrompt={finalPrompt}
                        editing={editing}
                        canEdit={canEditBase && editable}
                        referenceWarning={referenceWarning}
                        suggestGemini={suggestGemini}
                        onPickChip={handlePickChip}
                        onInstructionChange={handleInstructionChange}
                        onInstructionBlur={handleInstructionBlur}
                        onFinalPromptChange={setPromptOverride}
                        onEdit={handleEdit}
                        estimatedCredits={editEstimatedCredits}
                        estimating={editEstimating}
                      />
                    </>
                  )}
                </div>
              )}

              {/* Connected node — read-only detail. While its text is still arriving, show the
                  panel's SHAPE: a centred "no preview yet" in an empty pane reads as "nothing
                  is connected", which is the wrong impression for an input on its way. */}
              {isNodeSelected &&
                (selectedNodeReady && selectedNode ? (
                  <ConnectedDetailView node={selectedNode} />
                ) : loadingPreview ? (
                  <div className="flex h-full flex-col gap-4 px-6 py-6">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="min-h-0 flex-1 rounded-xl" />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-6">
                    <p className="text-sm text-muted-foreground">
                      This input has no preview yet.
                    </p>
                  </div>
                ))}

              {/* History — every generation with thumbnails and edit lineage */}
              {selected === "history" && (
                <div className="px-6 py-5">
                  {loadingVersions ? (
                    <div className="space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
                      <div className="space-y-1.5 pt-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="size-2 shrink-0 animate-pulse rounded-full bg-muted-foreground/20" />
                            <div
                              className="h-3 animate-pulse rounded bg-muted-foreground/20"
                              style={{ width: `${55 + i * 12}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : versions.length > 0 ? (
                    <ImageGenVersionHistory
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

              {/* Details — Review (eval, approval) */}
              {selected === "details" && (
                <div className="flex flex-col gap-6 px-6 py-5">
                  <LeftSection icon={BadgeCheck} label="Review">
                    {/* Skeleton while versions are in flight — otherwise this asserts
                        "Generate an image first…" and then snaps to the real control. */}
                    {loadingVersions ? (
                      <ApprovalSkeleton />
                    ) : mode === "result" && !!activeVersionId ? (
                      <div className="flex flex-col gap-3">
                        <InlineEvalBar
                          decision={evalDecision}
                          note={evalNote}
                          saving={evalSaving}
                          visible={mode === "result" && !!activeVersionId}
                          onDecision={handleEvalDecision}
                          onNote={setEvalNote}
                          onNoteBlur={handleEvalNoteBlur}
                        />
                        {/* R7.1/D160: canApprove is NOT gated on `editable`. Approval
                            writes only to node_versions, so it is not in the class of
                            writes the D33 lock serialises — a senior signs off while a
                            junior keeps editing. */}
                        <InlineApprovalBar
                          status={approvalStatus}
                          note={approvalNote}
                          approvedByName={approvedByName}
                          approvedAt={approvedAt}
                          saving={approvalSaving}
                          canApprove={identity?.role === "senior"}
                          onSet={saveApproval}
                          annotationCount={reviewDrafts.drafts.length}
                          annotating={reviewAnnotating}
                          onToggleAnnotate={
                            imageUrl ? () => setReviewAnnotating((v) => !v) : undefined
                          }
                          onConfirmDiscardDrafts={async () => {
                            const ok = await discardConfirm.confirm(
                              reviewDrafts.drafts.length,
                            );
                            if (ok) {
                              reviewDrafts.clear();
                              setReviewAnnotating(false);
                              setPendingBounds(null);
                            }
                            return ok;
                          }}
                        />
                        <AnnotationList
                          readOnly={false}
                          groups={groupByTimecode(reviewDrafts.drafts)}
                          onRemove={reviewDrafts.remove}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Generate an image first to review and approve it.
                      </p>
                    )}
                  </LeftSection>
                </div>
              )}
            </div>

            {/* Right column — the output, always visible. Faintly sunk so the
                action column reads as raised against it. */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/20 px-6 py-5">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
                  <span className="text-eyebrow">
                    {activeTab === "edit" && editBaseUrl && !editing
                      ? "Base image"
                      : "Generated image"}
                  </span>
                </div>
                {/* Edit mode acts on the image directly below, so the control sits with
                    that image rather than in the page header two panes away — and beside
                    the heading rather than pushed to the far edge, where it read as
                    unrelated chrome. A switch, not tabs: two modes of one surface, only
                    one of which departs from the default. */}
                {!loadingVersions && canEditBase && (
                  <Label
                    htmlFor={`image-edit-mode-${nodeId}`}
                    className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
                  >
                    Edit
                    <Switch
                      id={`image-edit-mode-${nodeId}`}
                      checked={activeTab === "edit"}
                      onCheckedChange={(checked) => {
                        setActiveTab(checked ? "edit" : "generate");
                        setSelected("image"); // the mode's controls live in this pane
                      }}
                    />
                  </Label>
                )}
              </div>
              <div className="min-h-0 flex-1">
                {activeTab === "edit" && editBaseUrl && !editing ? (
                  editMode === "paint" ? (
                    <ImageGenAnnotationCanvas
                      key={editBaseUrl}
                      ref={annotationRef}
                      baseUrl={editBaseUrl}
                      alt={title || "Base image"}
                      onMarksChange={setHasMaskRegion}
                    />
                  ) : (
                    // Same frame as the result view, so toggling Edit does not resize
                    // the picture. The hint is an overlay rather than a row beneath it —
                    // a flow hint would steal height and reintroduce the mismatch.
                    <div className="relative h-full w-fit max-w-full overflow-hidden rounded-xl border border-border bg-muted/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editBaseUrl}
                        alt={title || "Base image"}
                        className="h-full w-auto max-w-full object-contain"
                        draggable={false}
                      />
                      <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/80 px-3 py-1.5 text-center text-xs text-muted-foreground backdrop-blur-sm">
                        This model edits from your description — say what to
                        change and where.
                      </p>
                    </div>
                  )
                ) : (
                  <>
                    {mode === "skeleton" && (
                      // 9:16, centred — the same footprint the result frame will occupy,
                      // so the swap to the real image doesn't change shape.
                      <div className="aspect-[9/16] h-full max-w-full animate-pulse rounded-xl bg-muted-foreground/15" />
                    )}

                    {mode === "empty" && !editing && (
                      <div className="flex size-full items-center justify-center rounded-xl border border-dashed border-border">
                        <div className="text-center px-8">
                          <ImageIcon
                            className="mx-auto size-8 text-muted-foreground/40"
                            strokeWidth={1.5}
                          />
                          <p className="mt-3 text-sm font-medium text-muted-foreground">
                            Not generated yet
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            {promptUpstream
                              ? "Tune your params and click Generate."
                              : "Connect a Prompt node, then click Generate."}
                          </p>
                        </div>
                      </div>
                    )}

                    {mode === "empty" && editing && (
                      <div className="flex size-full items-center justify-center rounded-xl border border-border bg-muted/20">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Sparkles
                            className="size-4 animate-pulse text-primary"
                            strokeWidth={1.5}
                          />
                          Editing image…
                        </div>
                      </div>
                    )}

                    {mode === "result" && imageUrl && reviewAnnotating && (
                      // The senior paints on the RESULT here - same component as edit
                      // mode, different consumer. Pins and the note card go through the
                      // `overlay` slot so they position against the picture itself.
                      <ReviewAnnotationCanvas
                        key={`review-${imageUrl}`}
                        ref={reviewCanvasRef}
                        baseUrl={imageUrl}
                        alt={title || "Generated image"}
                        hintText="Paint a region, then write its note."
                        onStrokeEnd={(b) => setPendingBounds(b)}
                        overlay={
                          <>
                            {reviewDrafts.drafts.map((d) =>
                              d.bounds ? (
                                <AnnotationPin
                                  key={d.seq}
                                  seq={d.seq}
                                  x={d.bounds.x + d.bounds.w / 2}
                                  y={d.bounds.y + d.bounds.h / 2}
                                />
                              ) : null,
                            )}
                            {pendingBounds && (
                              <AnnotationNotePopover
                                mode="compose"
                                seq={reviewDrafts.drafts.length + 1}
                                bounds={pendingBounds}
                                onCommit={(noteText) => {
                                  const overlay =
                                    reviewCanvasRef.current?.toOverlayBase64();
                                  if (overlay) {
                                    reviewDrafts.commit(
                                      pendingBounds,
                                      overlay,
                                      noteText,
                                    );
                                    reviewCanvasRef.current?.clear();
                                  }
                                  setPendingBounds(null);
                                }}
                                onCancel={() => {
                                  reviewCanvasRef.current?.clear();
                                  setPendingBounds(null);
                                }}
                              />
                            )}
                          </>
                        }
                      />
                    )}

                    {mode === "result" && imageUrl && !reviewAnnotating && (
                      // w-fit: the frame hugs the image (height-driven, width from the
                      // image's own ratio) instead of filling the column and painting
                      // gutters inside the border. Overlays anchor to the image, not
                      // the empty column.
                      <div className="group relative h-full w-fit max-w-full overflow-hidden rounded-xl border border-border bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={title || "Generated image"}
                          className="h-full w-auto max-w-full object-contain"
                        />
                        {editing && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                            <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-sm font-medium shadow-card">
                              <Sparkles
                                className="size-4 animate-pulse text-primary"
                                strokeWidth={1.5}
                              />
                              Editing image…
                            </div>
                          </div>
                        )}
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleDownload}
                            className="h-auto gap-1 rounded-md border-0 bg-background/80 px-2 py-1 text-xs text-foreground backdrop-blur hover:bg-background/80 hover:text-foreground"
                            aria-label="Download image"
                          >
                            <Download className="size-3.5" strokeWidth={1.5} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setZoomOpen(true)}
                            className="h-auto gap-1 rounded-md border-0 bg-background/80 px-2 py-1 text-xs text-foreground backdrop-blur hover:bg-background/80 hover:text-foreground"
                          >
                            <ZoomIn className="size-3.5" strokeWidth={1.5} />{" "}
                            Zoom
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <DiscardAnnotationsDialog {...discardConfirm.dialogProps} />

        {zoomOpen && imageUrl && (
          <FullScreenImageZoom
            imageUrl={imageUrl}
            title={title}
            onClose={() => setZoomOpen(false)}
            onDownload={handleDownload}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
