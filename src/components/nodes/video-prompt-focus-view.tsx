"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Palette,
  PencilLine,
  BadgeCheck,
  SlidersHorizontal,
  FileInput,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "./field-label";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_MOTION_INSTRUCTION } from "@/lib/nodes/video-prompt";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { isVisionAttachment } from "@/lib/nodes/compose-message";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { CameraSelect } from "./camera-select";
import { SpeedSelect } from "./speed-select";
import { TargetProviderSelect } from "./target-provider-select";
import { DEFAULT_VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { findDescendantsOfType, findAncestorOfType } from "@/lib/canvas/graph";
import { LookContractField } from "./look-contract-field";
import { BeatCameraList } from "./beat-camera-list";
import type { ReelShot } from "@/lib/nodes/reel-script";
import { videoGenClientModelMap, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "@/lib/video-gen/client-models";
import type { VideoProvider } from "@/prompts/video-prompt-generate";
import {
  ConnectedDetailView,
  NodeIcon,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import { AddConnection } from "./add-connection";
import type { VersionSummary } from "./prompt-version-history";
import { UsagePopover } from "./prompt-usage-popover";
import { InlineEvalBar } from "./inline-eval-bar";
import { InlineApprovalBar } from "./inline-approval-bar";
import { ModelRequestPanel } from "./model-request-panel";
import { setVersionLabelAction } from "@/lib/actions/eval";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { useIdentity } from "@/hooks/use-identity";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApprovalStatus } from "@/lib/approval";
import { PromptVersionChips } from "./prompt-version-chips";
import {
  splitSentenceBeats,
  segmentByTerms,
  CAMERA_SPEC_PATTERNS,
} from "@/lib/nodes/prompt-focus";
import { ApprovalStatusBadge } from "@/components/review/approval-status-badge";
import { LeftSection } from "./focus-left-section";
import { RailItem } from "./focus-rail-item";

type VideoPromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  output: string | null;
  slices: KBSliceKey[];
  controls: VideoControls | null;
  targetProvider: VideoProvider | null;
  upstream: UpstreamNode[];
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveOutput: (output: string) => Promise<void>;
};

export function VideoPromptFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  instruction,
  output,
  slices,
  controls,
  targetProvider,
  upstream,
  onPatch,
  onSaveOutput,
}: VideoPromptFocusViewProps) {
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState(output ?? "");
  // Local mirror of the instruction prop. The textarea is controlled by THIS, not
  // by the prop directly: the prop round-trips through zustand + React Flow's
  // internal node store, so binding the textarea straight to it re-renders the
  // input with a not-yet-synced value and the browser resets the caret to the end
  // on every keystroke. Local state updates synchronously, so the caret is kept.
  const [instructionDraft, setInstructionDraft] = useState(instruction);
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ ambient: string; connected: ConnectedPreview[] }>({
    ambient: "",
    connected: [],
  });
  const [seed, setSeed] = useState<{ open: boolean; output: string | null; nodeId: string }>({
    open,
    output,
    nodeId,
  });
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  // Seeded from `open`, not `false`. The seed block below only arms this on the false → true
  // TRANSITION, and a node created by the guided button never has one: guidedCreateNext and
  // setFocusedNodeId land in the same batch, so the card mounts with its focus view already
  // open. The flag stayed false through the whole first resolve and the panel rendered its
  // "no preview yet" empty state for the 2-5s it took, instead of a skeleton.
  const [loadingPreview, setLoadingPreview] = useState(open);
  // False until this node's edges are known to be PERSISTED — gates every server-side
  // resolve below. See the flush effect for why.
  const [inputsPersisted, setInputsPersisted] = useState(false);
  // The selected rail item: "prompt" (the compose editor), "details", "request", or a
  // connected node's id (right pane shows that node's read-only detail).
  const [selected, setSelected] = useState<string>("prompt");
  const [evalDecision, setEvalDecision] = useState<"pass" | "fail" | null>(null);
  const [evalNote, setEvalNote] = useState("");
  // D29 approval flag — sibling of the eval signal, distinct field.
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const { identity } = useIdentity();
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const flushAutosave = useFlushAutosave();
  const [evalSaving, setEvalSaving] = useState(false);
  // A pending destructive action awaiting confirmation. Replaces window.confirm
  // so the prompt stays inside the design system instead of native OS chrome.
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);

  if (seed.open !== open || seed.output !== output || seed.nodeId !== nodeId) {
    const opening = open && !seed.open; // sheet just opened (false → true)
    const nodeChanged = seed.nodeId !== nodeId; // sheet reused for a different node
    setSeed({ open, output, nodeId });
    setDraft(output ?? "");
    setSelected("prompt"); // return to the compose editor on open / fresh generation
    // Re-seed the instruction buffer ONLY when opening or switching nodes — never on
    // an output change (that would clobber an in-progress instruction edit) and never
    // on the echo of our own per-keystroke write-through (that would re-introduce the
    // caret jump this buffer exists to prevent).
    if (opening || nodeChanged) setInstructionDraft(instruction);
    // Re-arm the left-panel skeleton ONLY on the open transition. The effect
    // below (keyed on [open, nodeId, slices]) is the sole thing that clears
    // it, and it does not re-run on output change — so re-arming here on a
    // regenerate/restore/save would strand it `true` forever.
    if (opening) {
      setLoadingPreview(true);
    }
    // Re-arm the "inputs are persisted" gate the same way (see the effect below). Adjusted
    // during render rather than in that effect, which cannot set state synchronously —
    // a node switch inside an already-open sheet has to wait for its own flush.
    if (opening || nodeChanged) {
      setInputsPersisted(false);
    }
  }

  // A connected node is selected when `selected` isn't one of the fixed rail keys.
  const isNodeSelected = !["prompt", "details", "request"].includes(selected);
  const selectedNode = isNodeSelected
    ? preview.connected.find((c) => c.nodeId === selected) ?? null
    : null;

  // Mirrors the image Prompt node's Generate button (prompt-focus-view.tsx) — same
  // estimatePromptCredits heuristic, folded into the button label below.
  const estimatedCredits = estimatePromptCredits(upstream.filter(isVisionAttachment).length);

  // D77: connected downstream Video Gen nodes are the single source of truth for the target
  // provider. None connected → the node's own selector value governs; multiple with differing
  // providers → provider-neutral (text-camera).
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const downstreamGen = findDescendantsOfType(nodeId, nodes, edges, "video-gen");

  // D201 — the upstream Shot decides which authoring surface this node shows. A multishot shot is
  // several cuts in one clip, so one camera move and one motion energy describe nothing about it;
  // it authors a LOOK contract and a camera per beat instead.
  const upstreamShot = findAncestorOfType(nodeId, nodes, edges, "shot");
  const upstreamShotData = upstreamShot?.data as
    | { multishot?: boolean; script?: { visual_script?: { shots?: ReelShot[] } } }
    | undefined;
  const upstreamShots = upstreamShotData?.script?.visual_script?.shots ?? [];
  // A single-beat node toggled to multishot means "the model may cut inside this shot" — there is
  // no ladder to author, so it keeps the single-shot controls.
  const isMultishot = upstreamShotData?.multishot === true && upstreamShots.length > 1;
  // D195 — Omni gets its own motion-prompt variant (the timecode ladder), so it maps to
  // "gemini-omni" rather than folding into Veo as it did before that variant existed.
  const providerOf = (modelId?: string): VideoProvider => {
    const provider = videoGenClientModelMap[modelId ?? DEFAULT_VIDEO_CLIENT_MODEL_ID]?.provider;
    if (provider === "kling") return "kling";
    if (provider === "gemini") return "gemini-omni";
    return "veo";
  };
  const downstreamProviders = Array.from(
    new Set(downstreamGen.map((n) => providerOf((n.data as { modelId?: string })?.modelId))),
  );
  const locked = downstreamProviders.length >= 1;
  const mixed = downstreamProviders.length > 1;
  // Narrows the persisted value to the union, defaulting anything unrecognised to Veo. Every
  // member must be listed: a node saved as "gemini-omni" fell back to Veo here while this only
  // knew "kling", so disconnecting its video node silently changed which prompt variant it wrote.
  const selectorValue: VideoProvider =
    targetProvider === "kling" || targetProvider === "gemini-omni" ? targetProvider : "veo";
  const effectiveProvider: VideoProvider = mixed
    ? "veo"
    : locked
      ? downstreamProviders[0]
      : selectorValue;
  const lockedLabel = mixed
    ? "Mixed downstream — writing provider-neutral"
    : locked
      ? `${videoGenClientModelMap[(downstreamGen[0].data as { modelId?: string })?.modelId ?? DEFAULT_VIDEO_CLIENT_MODEL_ID]?.label ?? "Video model"} · set by connected video node`
      : undefined;

  const dirty = (output ?? "") !== draft && draft.trim() !== "";
  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : output
      ? "result"
      : "empty";

  // `preserveEvalDraft` exists for the live-refresh path only — see useNodeVersionUpdates
  // below. Every other caller is reacting to the viewer's OWN action, where re-seeding
  // from the server is the point.
  async function fetchVersions(opts?: { preserveEvalDraft?: boolean }) {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = await res.json();
      const vs: VersionSummary[] = json.versions ?? [];
      const activeVid: string | null = json.activeVersionId ?? null;
      setVersions(vs);
      setActiveVersionId(activeVid);
      const active = vs.find((v) => v.id === activeVid);
      setEvalDecision(active?.decision ?? null);
      // The eval note is a CONTROLLED draft saved on blur, so re-seeding it mid-keystroke
      // discards whatever the viewer was typing. Harmless when they triggered the refresh
      // themselves; a silent loss when someone else's decision triggered it.
      if (!opts?.preserveEvalDraft) setEvalNote(active?.note ?? "");
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
      setApprovedByName(active?.approvedByName ?? null);
      setApprovedAt(active?.approvedAt ?? null);
    } catch {
      /* best-effort */
    }
  }

  // D179: keep this panel live while it is open — the same treatment the gen focus views
  // get, so a prompt node does not silently behave differently from an image one.
  useNodeVersionUpdates(nodeId, open, () => {
    void fetchVersions({ preserveEvalDraft: true });
  });

  /**
   * Everything below resolves this node's inputs SERVER-side, from PERSISTED edges
   * (compile-preview → resolveVideoPromptInputs). A node reached straight from the guided
   * "Create video prompt" button exists only in the client store at that moment — autosave
   * persists it on a 600ms debounce, which the fetch below used to beat, so the Connected
   * panel came up empty on first open and only filled in after a close-and-reopen.
   *
   * Flush first, then fetch. The sheet still opens instantly; `loadingPreview` (armed on the
   * open transition above) keeps the skeleton up across the flush AND the fetch behind it,
   * so the wait reads as loading rather than as "nothing is connected".
   *
   * Its own effect, not an await inside the fetch below: that one re-runs on every `slices`
   * change, and a flush per slice toggle would mean a full canvas save per checkbox.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        await flushAutosave();
      } catch (err) {
        console.error("[video-prompt] autosave flush failed:", err);
      }
      // Fetch even if the flush failed: autosave retries on its own, and a node whose edges
      // were already persisted must not be held hostage to an unrelated save failure.
      if (!cancelled) setInputsPersisted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, nodeId, flushAutosave]);

  useEffect(() => {
    if (!open || !inputsPersisted) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/versions`);
        if (!cancelled && res.ok) {
          const json = await res.json();
          const vs: VersionSummary[] = json.versions ?? [];
          const activeVid: string | null = json.activeVersionId ?? null;
          setVersions(vs);
          setActiveVersionId(activeVid);
          const active = vs.find((v) => v.id === activeVid);
          setEvalDecision(active?.decision ?? null);
          setEvalNote(active?.note ?? "");
          setApprovalStatus(active?.approvalStatus ?? "pending");
          setApprovalNote(active?.note ?? "");
        }
      } catch {
        /* best-effort */
      }
    })();

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/compile-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slices }),
        });
        const json = await res.json();
        if (!cancelled && res.ok) {
          setPreview({
            ambient: json.ambient ?? "",
            connected: (json.connected ?? []) as ConnectedPreview[],
          });
        }
      } catch {
        /* preview is best-effort */
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, nodeId, slices, inputsPersisted]);

  async function handleEvalDecision(d: "pass" | "fail" | null) {
    if (!activeVersionId) return;
    setEvalDecision(d);
    setEvalSaving(true);
    try {
      await setVersionLabelAction(activeVersionId, { decision: d, note: evalNote.trim() || null });
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
      await setVersionLabelAction(activeVersionId, { decision: evalDecision, note: evalNote.trim() || null });
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
      await setVersionApprovalAction(activeVersionId, { status, note });
      setApprovalStatus(status);
      setApprovalNote(note ?? "");
      // Push into the store so the on-canvas badge refreshes immediately — without
      // this the badge stays stale until a full reload re-hydrates from the DB.
      onPatch({ approvalStatus: status });
      // Re-read so the decision thread, status icons and approver name reflect the
      // decision on the screen it was made on, not only after a reopen (D173).
      await fetchVersions();
    } catch {
      toast.error("Failed to save approval");
    } finally {
      setApprovalSaving(false);
    }
  }

  async function runGenerate() {
    setGenerating(true);
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/video-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instructionDraft,
          slices,
          controls: controls ?? DEFAULT_VIDEO_CONTROLS,
          targetProvider: effectiveProvider,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Motion prompt generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message);
      await fetchVersions();
    } finally {
      setGenerating(false);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Restore failed");
      onPatch({ parsed: json.output });
      setActiveVersionId(versionId);
      await fetchVersions();
      toast.success("Version restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  async function handleSave() {
    try {
      await onSaveOutput(draft);
      onPatch({ parsed: draft });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  // YUV-288: navigating away must not silently drop an unsaved manual edit to the
  // generated prompt — same guard script-focus-view.tsx already applies to its draft.
  function requestClose() {
    if (dirty) {
      setConfirm({
        title: "Discard unsaved changes?",
        description:
          "You have edits that haven't been saved. Closing now will discard them.",
        actionLabel: "Discard",
        onConfirm: () => onOpenChange(false),
      });
      return;
    }
    onOpenChange(false);
  }

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key) ? slices.filter((k) => k !== key) : [...slices, key];
    onPatch({ kbSlices: next });
  }

  const activeRequest =
    versions.find((v) => v.id === activeVersionId)?.inputsUsed?.request ?? null;

  const reviewBadge =
    mode === "result" ? <ApprovalStatusBadge status={approvalStatus} /> : undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
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
              onClick={requestClose}
              className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </Button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  <EditableField
                    value={title || ""}
                    onCommit={(t) => onPatch({ title: normalizeTitle(t) })}
                    placeholder="Motion prompt"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Always rendered — pre-generation it reads "0 credits used". */}
                <UsagePopover versions={versions} />
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
            {lastError && !generating && (
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
              icon={<Clapperboard className="size-4 text-primary" />}
              label="Prompt"
              active={selected === "prompt"}
              onClick={() => setSelected("prompt")}
            />

            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground/70">
                Connected · {upstream.length}
              </span>
              <AddConnection
                targetId={nodeId}
                targetType="video-prompt"
                connectedIds={upstream.map((u) => u.id)}
              />
            </div>
            {upstream.length === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">No inputs connected.</p>
            ) : (
              upstream.map((u) => (
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
              icon={<SlidersHorizontal className="size-4 text-primary" />}
              label="Details"
              active={selected === "details"}
              onClick={() => setSelected("details")}
              badge={reviewBadge}
            />
            <RailItem
              icon={<FileInput className="size-4 text-primary" />}
              label="Sent to model"
              active={selected === "request"}
              onClick={() => setSelected("request")}
            />
          </nav>

          {/* Detail pane */}
          {/* No overflow-hidden: it would crop the raised column's left shadow.
              The columns inside own their scrolling. */}
          <div className="min-h-0 flex-1">
            {/* Prompt — the compose editor: compose (left) + generated output (right) */}
            {selected === "prompt" && (
              <div className="flex h-full w-full min-h-0 overflow-hidden">
                {/* Left column — compose. Instruction first (consistent with the
                    image-prompt view), then the compact control rows; the column is
                    capped so the generated prompt on the right owns the width.
                    max-w-lg rather than the image prompt's max-w-md: the frame +
                    camera-grid row is denser than the image prompt's controls. */}
                <div className="flex h-full w-[54%] shrink-0 min-h-0 flex-col overflow-hidden border-x border-primary/25 bg-card panel-raised">
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  <div className="flex flex-col gap-4 px-6 py-4">
                  {/* Instruction — top, like the image prompt */}
                  <div className="flex flex-col gap-3">
                    <FieldLabel icon={PencilLine} label="Instruction" />
                    <MentionInstructionEditor
                      value={instructionDraft}
                      onChange={(v) => {
                        setInstructionDraft(v);
                        onPatch({ instruction: v });
                      }}
                      placeholder={DEFAULT_MOTION_INSTRUCTION}
                      upstream={upstream}
                      disabled={!editable}
                      className="min-h-16"
                    />
                  </div>

                  {isMultishot ? (
                    /* D201 — the multishot surface. No Target model: a multishot shot's
                       downstream Video Gen node is already locked to Omni, so the control has
                       nothing left to offer. No Speed either — motion energy is a property of a
                       single continuous take, and here each beat sets its own. */
                    <>
                      <LookContractField
                        value={(controls ?? DEFAULT_VIDEO_CONTROLS).look ?? ""}
                        onChange={(look) =>
                          onPatch({
                            controls: { ...(controls ?? DEFAULT_VIDEO_CONTROLS), look },
                          })
                        }
                        disabled={!editable}
                      />
                      <BeatCameraList
                        shots={upstreamShots}
                        controls={controls ?? DEFAULT_VIDEO_CONTROLS}
                        onChange={(beats) =>
                          onPatch({
                            controls: { ...(controls ?? DEFAULT_VIDEO_CONTROLS), beats },
                          })
                        }
                        disabled={!editable}
                      />
                    </>
                  ) : (
                    <>
                      {/* Target model + Speed share one row so the column stays short enough
                          not to scroll. Both hug their own chips and sit left — stretching
                          Speed across the leftover width is what wrapped its third chip. */}
                      <div className="flex items-start gap-6">
                        <div className="shrink-0">
                          <TargetProviderSelect
                            value={effectiveProvider}
                            onChange={(p) => onPatch({ targetProvider: p })}
                            lockedLabel={lockedLabel}
                          />
                        </div>
                        <div className="min-w-0 shrink-0">
                          <SpeedSelect
                            value={(controls ?? DEFAULT_VIDEO_CONTROLS).speed}
                            onChange={(v) =>
                              onPatch({
                                controls: { ...(controls ?? DEFAULT_VIDEO_CONTROLS), speed: v },
                              })
                            }
                          />
                        </div>
                      </div>

                      {/* Camera owns the full column width. The grounding still used to sit
                          beside it in a Frame column, but the animated tiles need the room more
                          than a second copy of the image does — it is still reachable as the
                          connected Image in the left rail. */}
                      <CameraSelect
                        value={(controls ?? DEFAULT_VIDEO_CONTROLS).camera}
                        onChange={(v) =>
                          onPatch({
                            controls: { ...(controls ?? DEFAULT_VIDEO_CONTROLS), camera: v },
                          })
                        }
                      />
                    </>
                  )}

                  </div>

                  {/* Generate — flows after the controls, reached via the scrollbar */}
                  <div className="border-t border-border px-6 py-4">
                    <Button
                      className="w-full"
                      size="default"
                      onClick={runGenerate}
                      disabled={generating || !editable}
                    >
                      <Clapperboard className="size-4" />
                      {generating ? "Generating…" : output ? "Re-generate" : "Generate motion prompt"}
                      {!generating && <EstimatedCreditsLabel credits={estimatedCredits} />}
                    </Button>
                  </div>
                  </div>
                </div>

                {/* Right column — generated motion prompt output. Faintly tinted so the
                    white output card reads as the page's product against it (same
                    treatment as the image-prompt view). */}
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
                  {/* items-start: the title wraps and the version chips row can wrap
                      too — both anchor to the top instead of drifting vertically. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Clapperboard className="size-3.5 text-primary" />
                      <span className="text-eyebrow">Generated motion prompt</span>
                    </div>
                    <PromptVersionChips
                      versions={versions}
                      activeVersionId={activeVersionId}
                      restoring={restoring}
                      onSwitch={handleRestoreVersion}
                    />
                  </div>

                  {mode === "skeleton" && (
                    <div className="space-y-2.5 pt-1">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-4 animate-pulse rounded bg-muted-foreground/20"
                          style={{ width: `${70 + (i % 4) * 7}%` }}
                        />
                      ))}
                    </div>
                  )}

                  {mode === "empty" && (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border">
                      <div className="text-center px-8">
                        <Clapperboard className="size-8 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">
                          Not generated yet
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          Connect a still, set an instruction, and click Generate.
                        </p>
                      </div>
                    </div>
                  )}

                  {mode === "result" && (
                    <>
                      {/* Read view by default, same card treatment as the image-prompt
                          output: sentence beats, camera specs highlighted (there is no
                          curated term list for video controls — specs are the meaningful
                          subset for motion). Clicking swaps to the raw-text editor. */}
                      <EditableField
                        multiline
                        value={draft}
                        onCommit={setDraft}
                        readOnly={!editable}
                        placeholder="Empty — click to edit"
                        renderDisplay={(text) => (
                          <span className="block space-y-2.5">
                            {splitSentenceBeats(text).map((beat, i) => (
                              <span key={i} className="block">
                                {segmentByTerms(beat, CAMERA_SPEC_PATTERNS).map((seg, j) =>
                                  seg.highlighted ? (
                                    <span key={j} className="rounded bg-primary/10 px-0.5 font-bold">
                                      {seg.text}
                                    </span>
                                  ) : (
                                    <span key={j}>{seg.text}</span>
                                  ),
                                )}
                              </span>
                            ))}
                          </span>
                        )}
                        className="min-h-[16rem] max-w-[65ch] flex-1 resize-none overflow-y-auto rounded-xl p-4 text-base leading-7 [field-sizing:fixed]"
                      />
                      <div className="flex items-center gap-2 self-start">
                        <Button variant="outline" onClick={handleSave} disabled={!dirty}>
                          Save
                        </Button>
                        {dirty && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            Unsaved changes
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Connected node — read-only detail. While the inputs are still being resolved
                (the autosave flush plus the compile-preview call behind it), this shows the
                SHAPE of the panel rather than a centred "Loading…" — a brand-new node reached
                from the guided button lands here first, and a line of text in the middle of an
                empty pane reads like "nothing is connected", which is exactly the wrong
                impression while its inputs are on their way. */}
            {isNodeSelected &&
              (selectedNode ? (
                <ConnectedDetailView node={selectedNode} />
              ) : loadingPreview ? (
                <div className="flex h-full flex-col gap-4 px-6 py-6">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="min-h-0 flex-1 rounded-xl" />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6 py-6">
                  <p className="text-sm text-muted-foreground">This input has no preview yet.</p>
                </div>
              ))}

            {/* Details — Brand KB + Review (eval, approval) */}
            {selected === "details" && (
              <div className="flex h-full w-full max-w-3xl min-h-0 flex-col gap-6 overflow-y-auto px-6 py-6">
                <LeftSection
                  icon={Palette}
                  label="Brand KB"
                  action={
                    params?.id ? (
                      <Link
                        href={`/clients/${params.id}/kb`}
                        title="Edit Brand KB"
                        className="inline-flex items-center text-muted-foreground transition-colors hover:text-primary"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    ) : undefined
                  }
                >
                  <SliceToggles selected={slices} onToggle={toggleSlice} />
                </LeftSection>

                <hr className="border-border" />

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
                        // R7.1/D160: not gated on `editable` — approval writes only to
                        // node_versions, outside what the D33 lock serialises.
                        canApprove={identity?.role === "senior"}
                        onSet={saveApproval}
                        approvedByName={approvedByName}
                        approvedAt={approvedAt}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a motion prompt first to review and approve it.
                    </p>
                  )}
                </LeftSection>
              </div>
            )}

            {/* Sent to model — the exact request the active version sent (standalone) */}
            {selected === "request" && (
              <div className="flex h-full w-full max-w-3xl min-h-0 flex-col overflow-y-auto px-6 py-6">
                {activeRequest ? (
                  <ModelRequestPanel request={activeRequest} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No request recorded for this version — generate a motion prompt to capture
                    the system prompt, compiled input, and attachments sent to the model.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
