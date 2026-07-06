"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Download,
  ImageIcon,
  Link2,
  Maximize2,
  Settings2,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from "react-zoom-pan-pinch";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditableField } from "./editable-field";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import {
  ConnectedInputsCard,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import {
  ImageGenVersionHistory,
  type ImageGenVersionSummary,
} from "./image-gen-version-history";
import { ImageGenUsagePopover } from "./image-gen-usage-popover";
import { ImageGenEditPanel } from "./image-gen-edit-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageGenAnnotationCanvas, type AnnotationHandle } from "./image-gen-annotation-canvas";
import {
  ImageGenEditReferences,
  type EditReferenceItem,
} from "./image-gen-edit-references";
import {
  buildEditPrompt,
  selectEditReferenceUrls,
  type EditIntent,
} from "@/lib/image-gen/edit-prompt";
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
import { ImageGenOutputSettings } from "./image-gen-output-settings";

export type ImageGenFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  imageUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  editInstruction?: string;
  editIntent?: EditIntent;
  editReferenceNodeIds?: string[];
  upstream: Array<{
    id: string;
    type: string;
    fileUrl?: string;
    fileKind?: string;
  }>;
  onPatch: (patch: Record<string, unknown>) => void;
  /** Mirrors in-flight generate/edit state up to the node so its card can show
   *  a Processing pill even while the focus view is closed. */
  onProcessingChange?: (v: boolean) => void;
};

type ParamFormValues = Record<string, unknown>;

// ── Section header (matches prompt-focus-view.tsx LeftSection pattern) ────────

function LeftSection({
  icon: Icon,
  label,
  badge,
  action,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs text-muted-foreground">{badge}</span>
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Full-screen zoom controls (must be inside TransformWrapper) ───────────────

function ZoomControls({ onDownload }: { onDownload: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-6 inset-x-0 flex flex-col items-center gap-2 pointer-events-none z-10">
      <p className="text-[0.6rem] tracking-widest text-white/30 uppercase select-none">
        scroll to zoom · drag to pan · double-click to reset
      </p>
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomOut()}
          aria-label="Zoom out"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <ZoomOut className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => resetTransform()}
          aria-label="Fit to screen"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => zoomIn()}
          aria-label="Zoom in"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <ZoomIn className="size-3.5" strokeWidth={1.5} />
        </button>
        <div className="mx-1.5 h-3.5 w-px bg-white/20" />
        <button
          type="button"
          onClick={onDownload}
          aria-label="Download image"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <Download className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ── Main focus view ───────────────────────────────────────────────────────────

export function ImageGenFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  imageUrl,
  modelId,
  params,
  editInstruction,
  editIntent,
  editReferenceNodeIds,
  upstream,
  onPatch,
  onProcessingChange,
}: ImageGenFocusViewProps) {
  const selectedModelId = modelId ?? DEFAULT_CLIENT_MODEL_ID;
  const model =
    imageGenClientModelMap[selectedModelId] ??
    imageGenClientModelMap[DEFAULT_CLIENT_MODEL_ID];
  const editMode = editModeForModel(model.supportsMask); // "paint" | "type"

  const [paramValues, setParamValues] = useState<ParamFormValues>(() => ({
    ...defaultsForModel(model),
    ...(params ?? {}),
  }));

  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);

  // Mirror in-flight state up to the node card (survives focus-view close).
  useEffect(() => {
    onProcessingChange?.(generating || editing);
  }, [generating, editing, onProcessingChange]);
  const [editInstr, setEditInstr] = useState(editInstruction ?? "");
  const [intent, setIntent] = useState<EditIntent>(editIntent ?? "freeform");
  const [activeTab, setActiveTab] = useState<"generate" | "edit">("generate");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>(
    editReferenceNodeIds ?? [],
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
    null,
  );
  const [evalNote, setEvalNote] = useState("");
  const [evalSaving, setEvalSaving] = useState(false);
  // D29 approval flag — sibling of the eval signal, distinct field.
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalSaving, setApprovalSaving] = useState(false);
  const { identity } = useIdentity();
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const [fetchedPrompt, setFetchedPrompt] = useState<{
    nodeId: string;
    text: string;
  } | null>(null);
  const seenModelIdRef = useRef(model.id);

  useEffect(() => {
    if (model.id !== seenModelIdRef.current) {
      seenModelIdRef.current = model.id;
      const defaults = defaultsForModel(model);
      setParamValues(defaults);
      onPatch({ params: defaults });
      annotationRef.current?.clear(); // drop any painted mask — it must not cross models
      setHasMaskRegion(false);
    }
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
            (v) => v.id === json.activeVersionId,
          );
          setEvalDecision(active?.decision ?? null);
          setEvalNote(active?.note ?? "");
          setApprovalStatus(active?.approvalStatus ?? "pending");
          setApprovalNote(active?.note ?? "");
        }
      } catch {
        /* best-effort */
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
          (v) => v.id === json.activeVersionId,
        );
        if (!cancelled && active?.output) {
          setFetchedPrompt({ nodeId: promptNode.id, text: active.output });
        }
      } catch {
        /* best-effort */
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
  const refOverLimit = referenceCount > model.maxReferenceImages;

  // ── Edit-this-image derived values ──────────────────────────────────────────
  // Connected image URLs (file/draw/image-gen all expose fileUrl in `upstream`).
  const connectedImageUrls = upstream
    .filter((u) => (u.type === "file" || u.type === "draw" || u.type === "image-gen") && !!u.fileUrl)
    .map((u) => u.fileUrl as string);
  const firstConnectedImageUrl = connectedImageUrls[0];

  // Connected image NODES (id + url), for the edit-mode reference tiles.
  const connectedImageNodes = upstream
    .filter(
      (u) => (u.type === "file" || u.type === "draw" || u.type === "image-gen") && !!u.fileUrl,
    )
    .map((u) => ({ id: u.id, url: u.fileUrl as string, type: u.type }));

  // Base = the node's current image: the active attempt if present, else a connected image.
  const baseIsAttempt = Boolean(activeVersionId);
  const canEditBase = baseIsAttempt || Boolean(firstConnectedImageUrl);

  // Base image shown/annotated in Edit mode: the active attempt, else the first connected image.
  // The annotation canvas is keyed on this url, so a new base remounts it with a blank overlay
  // — marks never carry over onto a freshly generated image.
  const editBaseUrl = imageUrl ?? firstConnectedImageUrl ?? null;
  const baseNodeId =
    !baseIsAttempt && connectedImageNodes.length > 0 ? connectedImageNodes[0].id : null;

  const referenceItems: EditReferenceItem[] = connectedImageNodes.map((n) => ({
    id: n.id,
    url: n.url,
    label:
      n.type === "draw" ? "Sketch" : n.type === "image-gen" ? "Image reference" : "Image file",
    isBase: n.id === baseNodeId,
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
  const composedPrompt = editInstr.trim()
    ? buildEditPrompt({
        instruction: editInstr,
        intent,
        hasExtraReference,
        masked: editMode === "paint" && hasMaskRegion,
      })
    : "";
  const finalPrompt = promptOverride ?? composedPrompt;
  const referenceWarning =
    (intent === "replace" || intent === "add") && !hasExtraReference;
  const suggestGemini = model.provider !== "gemini";

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
    [upstream],
  );

  const preview = useMemo<ConnectedPreview[]>(() => {
    const promptNode = upstream.find((u) => u.type === "prompt");
    if (!promptNode || fetchedPrompt?.nodeId !== promptNode.id) return [];
    return [
      {
        nodeId: promptNode.id,
        type: "prompt",
        label: "Image prompt",
        text: fetchedPrompt.text,
      },
    ];
  }, [upstream, fetchedPrompt]);

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
        (v) => v.id === json.activeVersionId,
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
        throw new Error(json.error ?? "Generation failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Image generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
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
    setSelectedRefIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      onPatch({ editReferenceNodeIds: next });
      return next;
    });
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
    const baseImageUrl = baseVersionId ? undefined : firstConnectedImageUrl;
    if (!baseVersionId && !baseImageUrl) {
      toast.error("Generate an image, or connect an image reference, to edit it.");
      return;
    }
    setEditing(true);
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
      if (!res.ok || !json.imageUrl) throw new Error(json.error ?? "Edit failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      annotationRef.current?.clear();
      await fetchVersions();
      toast.success("Image edited");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed");
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
      const res = await fetch(imageUrl, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const filename = `${(title || "generated-image").replace(/\s+/g, "-").toLowerCase()}.${ext}`;
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
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
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  <EditableField
                    value={title || ""}
                    onCommit={(t) => onPatch({ title: normalizeTitle(t) })}
                    placeholder="Image generation"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Choose a model, tune params, and generate an image from your
                  connected prompt.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEditBase && (
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as "generate" | "edit")}
                  >
                    <TabsList>
                      <TabsTrigger value="generate">Generate</TabsTrigger>
                      <TabsTrigger value="edit">Edit</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
                {versions.length > 0 && (
                  <ImageGenUsagePopover versions={versions} />
                )}
                <Button
                  size="lg"
                  onClick={handleGenerate}
                  disabled={generating || editing || !promptUpstream || !editable}
                >
                  <Sparkles className="size-4" strokeWidth={1.5} />
                  {generating
                    ? "Generating…"
                    : editing
                      ? "Editing…"
                      : imageUrl
                        ? "Re-generate"
                        : "Generate"}
                </Button>
              </div>
            </header>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 flex justify-center overflow-hidden">
          <div className="w-full max-w-5xl flex min-h-0 overflow-hidden">
            {/* Left panel */}
            <div className="w-[40%] border-r border-border overflow-y-auto px-6 py-6 flex flex-col gap-6">
              {activeTab === "edit" && canEditBase && (
                <div className="space-y-4">
                  <ImageGenEditReferences
                    items={referenceItems}
                    selectedIds={selectedRefIds}
                    onToggle={handleToggleRef}
                  />
                  <ImageGenEditPanel
                    intent={intent}
                    instruction={editInstr}
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
                  />
                </div>
              )}

              {versions.length > 0 && (
                <ImageGenVersionHistory
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onRestore={handleRestoreVersion}
                  restoring={restoring}
                />
              )}

              <LeftSection icon={Settings2} label="Output settings">
                <ImageGenOutputSettings
                  model={model}
                  values={paramValues}
                  onValuesChange={setParamValues}
                  onCommit={commitParams}
                  onModelChange={changeModel}
                />
              </LeftSection>

              <LeftSection
                icon={Link2}
                label="Connected"
                badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
              >
                <ConnectedInputsCard
                  upstream={upstreamForCard}
                  preview={preview}
                />
                {refOverLimit && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[0.7rem] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertTriangle
                      className="mt-0.5 size-3 shrink-0"
                      strokeWidth={1.5}
                    />
                    <span>
                      {referenceCount} reference images connected — only the
                      first {model.maxReferenceImages} will be used by{" "}
                      {model.label}.
                    </span>
                  </div>
                )}
              </LeftSection>
            </div>

            {/* Right panel */}
            <div className="flex-1 min-h-0 flex flex-col px-6 py-6">
              <InlineEvalBar
                label="Generated Image"
                decision={evalDecision}
                note={evalNote}
                saving={evalSaving}
                visible={mode === "result" && !!activeVersionId}
                onDecision={handleEvalDecision}
                onNote={setEvalNote}
                onNoteBlur={handleEvalNoteBlur}
              />

              {mode === "result" && !!activeVersionId && (
                <div className="mt-3">
                  <InlineApprovalBar
                    status={approvalStatus}
                    note={approvalNote}
                    saving={approvalSaving}
                    canApprove={editable && identity?.role === "senior"}
                    onSet={saveApproval}
                  />
                </div>
              )}

              <div className="mt-3 flex-1 min-h-0">
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
                        This model edits from your description — say what to change and where.
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
                      <Sparkles className="size-4 animate-pulse text-primary" strokeWidth={1.5} />
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
                          <Sparkles className="size-4 animate-pulse text-primary" strokeWidth={1.5} />
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
                        <ZoomIn className="size-3.5" strokeWidth={1.5} /> Zoom
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

// ── Full-screen image viewer (portal-rendered, bypasses Dialog positioning) ──

function FullScreenImageZoom({
  imageUrl,
  title,
  onClose,
  onDownload,
}: {
  imageUrl: string;
  title: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generated image"
      className="fixed inset-0 z-[100] flex flex-col bg-black/97 text-white animate-in fade-in-0 duration-200"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" strokeWidth={1.5} />
      </button>
      <TransformWrapper
        doubleClick={{ mode: "reset" }}
        minScale={0.5}
        maxScale={8}
        centerOnInit
        wheel={{ step: 0.03 }}
      >
        <TransformComponent
          wrapperClass="!w-screen !h-screen"
          contentClass="!w-full !h-full flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title || "Generated image"}
            className="max-h-screen max-w-full object-contain"
            draggable={false}
          />
        </TransformComponent>
        <ZoomControls onDownload={onDownload} />
      </TransformWrapper>
    </div>,
    document.body,
  );
}
