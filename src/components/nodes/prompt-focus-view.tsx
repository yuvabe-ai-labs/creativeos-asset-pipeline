"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
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
import { AddConnection } from "./add-connection";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { isVisionAttachment } from "@/lib/nodes/compose-message";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { ShotControlsRow } from "./shot-controls-row";
import {
  deriveShotControlDefaults,
  DEFAULT_SHOT_CONTROLS,
  type ShotControls,
} from "@/lib/nodes/shot-controls";
import {
  ConnectedDetailView,
  NodeIcon,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import type { VersionSummary } from "./prompt-version-history";
import { UsagePopover } from "./prompt-usage-popover";
import { InlineEvalBar } from "./inline-eval-bar";
import { InlineApprovalBar } from "./inline-approval-bar";
import { ModelRequestPanel } from "./model-request-panel";
import { setVersionLabelAction } from "@/lib/actions/eval";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { useIdentity } from "@/hooks/use-identity";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApprovalStatus } from "@/lib/approval";
import { cn } from "@/lib/utils";
import { PromptVersionChips } from "./prompt-version-chips";
import { describeApprovalPill } from "@/lib/nodes/prompt-focus";
import { LeftSection } from "./focus-left-section";
import { RailItem } from "./focus-rail-item";
import { PromptShotReference, PromptShotReferenceEmpty } from "./prompt-shot-reference";

type PromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  output: string | null;
  slices: KBSliceKey[];
  controls: ShotControls | null;
  upstream: UpstreamNode[];
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveOutput: (output: string) => Promise<void>;
};

export function PromptFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  instruction,
  output,
  slices,
  controls,
  upstream,
  onPatch,
  onSaveOutput,
}: PromptFocusViewProps) {
  const params = useParams<{ id: string }>();
  const estimatedCredits = estimatePromptCredits(upstream.filter(isVisionAttachment).length);
  const [draft, setDraft] = useState(output ?? "");
  // Local mirror of the instruction prop. The textarea is controlled by THIS, not
  // by the prop directly: the prop round-trips through zustand + React Flow's
  // internal node store, so binding the textarea straight to it re-renders the
  // input with a not-yet-synced value and the browser resets the caret to the end
  // on every keystroke. Local state updates synchronously, so the caret is kept.
  const [instructionDraft, setInstructionDraft] = useState(instruction);
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    ambient: string;
    connected: ConnectedPreview[];
  }>({
    ambient: "",
    connected: [],
  });
  const [seed, setSeed] = useState<{
    open: boolean;
    output: string | null;
    nodeId: string;
  }>({
    open,
    output,
    nodeId,
  });
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  // Seeded from `open`, not `false` — see the note in video-prompt-focus-view.tsx: a node
  // created by the guided button mounts with its focus view already open, so the false → true
  // transition the seed block arms on never happens and the panel showed its empty state
  // instead of a skeleton for the whole first resolve.
  const [loadingPreview, setLoadingPreview] = useState(open);
  // False until this node's edges are known to be PERSISTED — gates every server-side
  // resolve below. See the flush effect for why.
  const [inputsPersisted, setInputsPersisted] = useState(false);
  // The selected rail item: "prompt" (the compose editor), "kb", "review", or a
  // connected node's id (right pane shows that node's read-only detail).
  const [selected, setSelected] = useState<string>("prompt");
  const [evalDecision, setEvalDecision] = useState<"pass" | "fail" | null>(null);
  const [evalNote, setEvalNote] = useState("");
  // D29 approval flag — sibling of the eval signal, distinct field.
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
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
  // Pinned shot preview beside the compose column — Prompt nodes carry one shot in
  // practice; show the first.
  const shotPreview = preview.connected.find((c) => c.type === "shot") ?? null;
  // The compose layout owns both the "Prompt" rail item and any connected-input selection:
  // selecting a connected input swaps the CENTER column to its read-only detail; the right
  // column is ALWAYS the generated output.
  const showComposeLayout = selected === "prompt" || isNodeSelected;
  const detailNode = selectedNode;

  const dirty = (output ?? "") !== draft && draft.trim() !== "";
  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : output
      ? "result"
      : "empty";

  const instructionPlaceholder = useMemo(() => {
    const script = upstream.find((u) => u.type === "script");
    const fileCount = upstream.filter((u) => u.type === "file").length;
    if (script) {
      return `Using the reel script "${script.label || "attached"}", generate a cinematic image prompt for each visual shot…`;
    }
    if (fileCount > 0) {
      return `Referencing the ${fileCount} attached file${fileCount > 1 ? "s" : ""}, create a detailed image prompt…`;
    }
    return DEFAULT_INSTRUCTION;
  }, [upstream]);

  async function fetchVersions() {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = await res.json();
      const versions: VersionSummary[] = json.versions ?? [];
      const activeVid: string | null = json.activeVersionId ?? null;
      setVersions(versions);
      setActiveVersionId(activeVid);
      const active = versions.find((v) => v.id === activeVid);
      setEvalDecision(active?.decision ?? null);
      setEvalNote(active?.note ?? "");
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
    } catch {
      /* best-effort */
    }
  }

  /**
   * Everything below resolves this node's inputs SERVER-side, from PERSISTED edges
   * (compile-preview → resolvePromptInputs). A node reached straight from the guided
   * "Create image prompt" button exists only in the client store at that moment — autosave
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
        console.error("[prompt] autosave flush failed:", err);
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
          const versions: VersionSummary[] = json.versions ?? [];
          const activeVid: string | null = json.activeVersionId ?? null;
          setVersions(versions);
          setActiveVersionId(activeVid);
          const active = versions.find((v) => v.id === activeVid);
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

  // Seed per-shot controls from the connected shot the first time they're unset; the operator
  // can then override and we never re-derive (the `controls != null` guard).
  useEffect(() => {
    if (!open || controls != null || loadingPreview) return;
    const shotText = preview.connected.find((c) => c.type === "shot")?.text ?? "";
    onPatch({ controls: deriveShotControlDefaults(shotText) });
  }, [open, controls, loadingPreview, preview.connected, onPatch]);

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

  async function runGenerate() {
    setGenerating(true);
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instructionDraft, slices, controls: controls ?? DEFAULT_SHOT_CONTROLS }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Prompt generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
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
    const next = slices.includes(key)
      ? slices.filter((k) => k !== key)
      : [...slices, key];
    onPatch({ kbSlices: next });
  }

  const activeRequest =
    versions.find((v) => v.id === activeVersionId)?.inputsUsed?.request ?? null;

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
          pillTone,
        )}
      >
        {pill.tone === "positive" ? "Approved" : pill.tone === "warning" ? "Changes" : "Pending"}
      </span>
    ) : undefined;

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
          <div className="mx-auto w-full max-w-6xl px-6 pb-5 pt-3">
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
                    placeholder="Image prompt"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && <UsagePopover versions={versions} />}
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
        <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 overflow-hidden">
          {/* Rail */}
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem
              icon={<Sparkles className="size-4 text-primary" />}
              label="Prompt"
              active={selected === "prompt"}
              onClick={() => setSelected("prompt")}
            />

            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Connected · {upstream.length}
              </span>
              <AddConnection
                targetId={nodeId}
                targetType="prompt"
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
          <div className="min-h-0 flex-1 overflow-hidden">
            {/* Prompt — two-column compose: the instruction + controls sit in the center
                column (which swaps to a selected connected input's read-only detail), and
                the generated prompt owns the right column. */}
            {showComposeLayout && (
              <div className="flex h-full min-h-0 w-full">
                {/* Center column — instruction & controls; swaps to a connected input's
                    read-only detail when one is selected in the rail. The right column
                    stays the generated output either way. */}
                <div className="flex h-full w-full max-w-md min-h-0 flex-col overflow-hidden border-r border-border">
                  {isNodeSelected ? (
                    detailNode ? (
                      <ConnectedDetailView node={detailNode} />
                    ) : loadingPreview ? (
                      // The panel's SHAPE while its inputs resolve (the autosave flush plus the
                      // compile-preview behind it) — a centred "Loading…" in an empty pane reads
                      // like "nothing is connected", which is the wrong impression for a node
                      // whose inputs are merely on their way.
                      <div className="flex h-full flex-col gap-4 px-6 py-6">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="min-h-0 flex-1 rounded-xl" />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 py-6">
                        <p className="text-sm text-muted-foreground">This input has no preview yet.</p>
                      </div>
                    )
                  ) : (
                    <>
                  {/* Whole column scrolls — shot reference + instruction + controls + the
                      Generate button all flow together; when content extends you reach the
                      button via the scrollbar rather than pinning it to the bottom. */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {shotPreview ? (
                      <PromptShotReference label={shotPreview.label} text={shotPreview.text} />
                    ) : (
                      <PromptShotReferenceEmpty />
                    )}

                    {/* Instruction + controls */}
                    <div className="flex flex-col gap-3 border-t border-border px-6 py-5">
                      <div className="flex items-center gap-1.5">
                        <PencilLine className="size-3.5 text-primary" />
                        <span className="text-eyebrow">Instruction</span>
                      </div>
                      <MentionInstructionEditor
                        value={instructionDraft}
                        onChange={(v) => {
                          setInstructionDraft(v);
                          onPatch({ instruction: v });
                        }}
                        placeholder={instructionPlaceholder}
                        upstream={upstream}
                        disabled={!editable}
                        className="min-h-20"
                      />
                      <ShotControlsRow
                        controls={controls ?? DEFAULT_SHOT_CONTROLS}
                        onChange={(next) => onPatch({ controls: next })}
                      />
                    </div>

                    {/* Generate — flows after the controls, reached via the scrollbar */}
                    <div className="border-t border-border px-6 py-4">
                      <Button
                        className="w-full"
                        size="default"
                        onClick={runGenerate}
                        disabled={generating || !editable}
                      >
                        <Sparkles className="size-4" />
                        {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
                        {!generating && <EstimatedCreditsLabel credits={estimatedCredits} />}
                      </Button>
                    </div>
                  </div>
                    </>
                  )}
                </div>

                {/* Right column — ALWAYS the generated output */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="flex h-full flex-col gap-3 px-6 py-5">
                      <div className="flex shrink-0 items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="size-3.5 text-primary" />
                          <span className="text-eyebrow">Generated prompt</span>
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
                        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
                          <div className="text-center px-8">
                            <Sparkles className="size-8 mx-auto text-muted-foreground/40 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">
                              Not generated yet
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground/70">
                              Write an instruction and click Generate.
                            </p>
                          </div>
                        </div>
                      )}

                      {mode === "result" && (
                        <>
                          <Textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="min-h-64 flex-1 resize-none rounded-xl p-4 text-base leading-relaxed [field-sizing:fixed]"
                          />
                          <div className="flex shrink-0 items-center gap-2 self-start">
                            <Button onClick={handleSave} disabled={!dirty}>
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
              </div>
            )}

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
                        canApprove={editable && identity?.role === "senior"}
                        onSet={saveApproval}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a prompt first to review and approve it.
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
                    No request recorded for this version — generate a prompt to capture the
                    system prompt, compiled input, and attachments sent to the model.
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
