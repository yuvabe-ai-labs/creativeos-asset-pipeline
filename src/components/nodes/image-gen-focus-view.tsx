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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { setVersionLabelAction } from "@/lib/actions/eval";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { useIdentity } from "@/hooks/use-identity";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import type { ApprovalStatus } from "@/lib/approval";
import {
  imageGenClientModelMap,
  DEFAULT_CLIENT_MODEL_ID,
  defaultsForModel,
} from "@/lib/image-gen/client-models";
import { smartMergeParams } from "@/lib/image-gen/params/merge";
import { ImageGenOutputSettingsBody } from "./image-gen-output-settings-body";
import {
  validateReferenceImages,
  type RefImageMeta,
} from "@/lib/image-gen/validate";
import { cn } from "@/lib/utils";
import { describeApprovalPill } from "@/lib/nodes/prompt-focus";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
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
    return base;
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
  const [approvalSaving, setApprovalSaving] = useState(false);
  const { identity } = useIdentity();
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const [fetchedPrompt, setFetchedPrompt] = useState<{
    nodeId: string;
    text: string;
  } | null>(null);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  // Starts true (not false): the debounced estimate effect only flips this on the first
  // effect pass after mount, one paint after the initial render — starting at false let the
  // Generate button render briefly enabled/uncosted before that first effect ran. Starting
  // true means the button is disabled from the very first paint; the effect corrects it to
  // false quickly if no estimate is actually needed (e.g. no prompt connected yet).
  const [estimating, setEstimating] = useState(true);
  // Edit tab's own estimate — separate state from estimatedCredits/estimating above so the
  // two tabs' debounced effects never race each other's setState calls. Starts true for the
  // same reason as the Generate estimate above: the Edit button's disabled state is wired to
  // "estimating" too, so starting false would let it render briefly enabled/uncosted before
  // the first debounced effect pass corrects it.
  const [editEstimatedCredits, setEditEstimatedCredits] = useState<number | null>(null);
  const [editEstimating, setEditEstimating] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // The selected rail item: "image" (the hero pane), "history", "details", or a
  // connected node's id (right pane shows that node's read-only detail).
  const [selected, setSelected] = useState<string>("image");
  const [openSeed, setOpenSeed] = useState(open);
  const seenModelIdRef = useRef(model.id);

  // Re-arm skeletons on open transition.
  if (open !== openSeed) {
    setOpenSeed(open);
    if (open) {
      setLoadingVersions(true);
      // Only arm the preview skeleton if there's actually a prompt node to fetch.
      setLoadingPreview(upstream.some((u) => u.type === "prompt"));
      setSelected("image"); // return to the hero pane on open
    }
  }

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

  // Pre-generation cost estimate. Only meaningful on the Generate tab (Edit has its own
  // action button, out of scope per this plan) and once there's a prompt to estimate from.
  // No debounce: the estimate route computes input-token cost from a static derived formula
  // (D92) rather than a live vendor API call, so there's no per-keystroke cost to guard
  // against — the fetch to our own /estimate route fires immediately on every param change.
  useEffect(() => {
    if (!open || activeTab === "edit" || !promptUpstream) {
      setEstimatedCredits(null);
      setEstimating(false);
      return;
    }
    if (!fetchedPrompt?.text) {
      // A prompt node IS connected, but its output hasn't loaded yet (the separate
      // fetchedPrompt effect above is still in flight) — this is not the same as "no
      // prompt connected," so keep the button in its disabled/loading state rather than
      // flashing it enabled with no cost for the second or two before the fetch resolves.
      // That fetch's completion updates fetchedPrompt.text, which re-runs this effect.
      setEstimating(true);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/image-generate/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            quality: paramValues.quality,
            aspect_ratio: paramValues.aspect_ratio,
            image_size: paramValues.image_size,
            prompt: fetchedPrompt.text,
            referenceUrls: connectedImageUrls,
          }),
        });
        const json = (await res.json()) as { estimatedCredits: number | null };
        if (cancelled) return;
        if (res.ok) {
          setEstimatedCredits(json.estimatedCredits);
        } else {
          setEstimatedCredits(null);
        }
      } catch {
        if (!cancelled) setEstimatedCredits(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // connectedImageUrls/paramValues/fetchedPrompt omitted on purpose — each is a new object
    // reference on renders that don't actually change its contents (e.g. a sibling state
    // update, or the [open, upstream] prompt-fetch effect re-running and producing a new-but-
    // equal fetchedPrompt object), which was re-firing this effect (and re-fetching the
    // estimate) with no real input change. Stable JSON-stringified/primitive stand-ins fix it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeTab,
    Boolean(promptUpstream),
    selectedModelId,
    JSON.stringify(paramValues),
    connectedImageUrlsKey,
    fetchedPrompt?.text,
    nodeId,
  ]);

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

  // Extras = the connected image nodes the user marked (base excluded). Empty selection falls
  // back to "all other connected images" (D27 default) via selectEditReferenceUrls.
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

  // Pre-generation cost estimate for the Edit tab, keyed off the edit flow's own inputs (the
  // same prompt/references handleEdit() itself sends), since editing reserves and charges
  // credits the same way generating does. No debounce — see the Generate-tab estimate effect
  // above for why. Reference-URL approximation matches the Generate estimate's own precedent:
  // this passes the raw base+extras list, not assembleEditReferences()'s post-max-count/dedup
  // list the real route actually reserves against — an existing, accepted gap between
  // estimate and reservation, kept consistent rather than special-cased.
  useEffect(() => {
    if (!open || activeTab !== "edit" || !canEditBase || !finalPrompt.trim()) {
      setEditEstimatedCredits(null);
      setEditEstimating(false);
      return;
    }
    let cancelled = false;
    setEditEstimating(true);
    const referenceUrls = [editBaseUrl, ...selectedExtraUrls].filter(
      (u): u is string => Boolean(u),
    );
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/image-generate/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            quality: paramValues.quality,
            aspect_ratio: paramValues.aspect_ratio,
            image_size: paramValues.image_size,
            prompt: finalPrompt,
            referenceUrls,
          }),
        });
        const json = (await res.json()) as { estimatedCredits: number | null };
        if (cancelled) return;
        if (res.ok) {
          setEditEstimatedCredits(json.estimatedCredits);
        } else {
          setEditEstimatedCredits(null);
        }
      } catch {
        if (!cancelled) setEditEstimatedCredits(null);
      } finally {
        if (!cancelled) setEditEstimating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // paramValues (an object) goes in via JSON.stringify, same reason as the Generate
    // estimate effect above — a stable primitive stand-in avoids re-firing on renders that
    // don't actually change its contents. finalPrompt is already a string primitive, so it's
    // used directly with no stand-in needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeTab,
    canEditBase,
    selectedModelId,
    JSON.stringify(paramValues),
    finalPrompt,
    editReferenceUrlsKey,
    nodeId,
  ]);

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

  async function fetchVersions() {
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
      setEvalNote(active?.note ?? "");
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
    } catch {
      /* best-effort */
    }
  }

  async function handleGenerate() {
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

  async function handleRestoreVersion(versionId: string) {
    setRestoring(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/restore-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const json = (await res.json()) as { output?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Restore failed");
      if (json.output) onPatch({ parsed: json.output });
      setActiveVersionId(versionId);
      setHasMaskRegion(false); // restored a different base — drop any stale mask-region flag
      await fetchVersions();
      toast.success("Version restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
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
      await setVersionApprovalAction(activeVersionId, {
        status,
        approvedBy: identity?.name ?? null,
        note,
      });
      setApprovalStatus(status);
      setApprovalNote(note ?? "");
      // Push into the store so the on-canvas badge refreshes immediately — without
      // this the badge stays stale until a full reload re-hydrates from the DB.
      onPatch({ approvalStatus: status });
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

  const pill = describeApprovalPill(approvalStatus);
  const pillTone =
    pill.tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400"
      : pill.tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400"
      : "border-border bg-muted text-muted-foreground";

  const reviewBadge =
    mode === "result" ? (
      <span
        className={cn(
          "shrink-0 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold",
          pillTone
        )}
      >
        {pill.tone === "positive"
          ? "Approved"
          : pill.tone === "warning"
          ? "Changes"
          : "Pending"}
      </span>
    ) : undefined;

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
                {/* The Generate/Edit tabs (needs canEditBase) and Usage popover (needs
                    versions) both depend on the versions fetch that starts when the sheet
                    opens — reserve their space with a skeleton instead of rendering nothing
                    until it resolves, which read as the header controls suddenly popping in. */}
                {loadingVersions ? (
                  <Skeleton className="h-8 w-44 rounded-lg" />
                ) : (
                  <>
                    {canEditBase && (
                      <Tabs
                        value={activeTab}
                        onValueChange={(v) => {
                          setActiveTab(v as "generate" | "edit");
                          setSelected("image"); // the tab's UI lives in the hero pane
                        }}
                      >
                        <TabsList>
                          <TabsTrigger value="generate">Generate</TabsTrigger>
                          <TabsTrigger value="edit">Edit</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    )}
                    {versions.length > 0 && (
                      <ImageGenUsagePopover
                        versions={versions}
                        nodeId={nodeId}
                        upstreamNodeIds={upstream.map((u) => u.id)}
                      />
                    )}
                  </>
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
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
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
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Middle column */}
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-r border-border">
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
                    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                      <LeftSection icon={Settings2} label="Output settings">
                        {outputSettingsBody}
                      </LeftSection>
                    </div>
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

              {/* Connected node — read-only detail */}
              {isNodeSelected &&
                (selectedNodeReady && selectedNode ? (
                  <ConnectedDetailView node={selectedNode} />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-6">
                    <p className="text-sm text-muted-foreground">
                      {loadingPreview
                        ? "Loading…"
                        : "This input has no preview yet."}
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
                    {mode === "result" && !!activeVersionId ? (
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
                        <InlineApprovalBar
                          status={approvalStatus}
                          note={approvalNote}
                          saving={approvalSaving}
                          canApprove={editable && identity?.role === "senior"}
                          onSet={saveApproval}
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

            {/* Right column — the output, always visible */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
                <span className="text-eyebrow">
                  {activeTab === "edit" && editBaseUrl && !editing
                    ? "Base image"
                    : "Generated image"}
                </span>
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
                    <div className="flex size-full flex-col items-center justify-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editBaseUrl}
                        alt={title || "Base image"}
                        className="max-h-[80%] max-w-full rounded-xl border border-border object-contain"
                        draggable={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        This model edits from your description — say what to
                        change and where.
                      </p>
                    </div>
                  )
                ) : (
                  <>
                    {mode === "skeleton" && (
                      <div className="size-full animate-pulse rounded-xl bg-muted-foreground/15" />
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

                    {mode === "result" && imageUrl && (
                      <div className="group relative size-full overflow-hidden rounded-xl border border-border bg-muted/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={title || "Generated image"}
                          className="size-full object-contain"
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
                          <button
                            type="button"
                            onClick={handleDownload}
                            className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur"
                            aria-label="Download image"
                          >
                            <Download className="size-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setZoomOpen(true)}
                            className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur"
                          >
                            <ZoomIn className="size-3.5" strokeWidth={1.5} />{" "}
                            Zoom
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

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
