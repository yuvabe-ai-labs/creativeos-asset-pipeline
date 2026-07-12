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
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditableField } from "./editable-field";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_MOTION_INSTRUCTION } from "@/lib/nodes/video-prompt";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { VideoControlsRow } from "./video-controls-row";
import { DEFAULT_VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
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
import type { ApprovalStatus } from "@/lib/approval";
import { cn } from "@/lib/utils";
import { PromptVersionChips } from "./prompt-version-chips";
import { describeApprovalPill } from "@/lib/nodes/prompt-focus";
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
  const [loadingPreview, setLoadingPreview] = useState(false);
  // The selected rail item: "prompt" (the compose editor), "details", "request", or a
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
  const [evalSaving, setEvalSaving] = useState(false);

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
    // Re-arm the left-panel skeletons ONLY on the open transition. The effect
    // below (keyed on [open, nodeId, slices]) is the sole thing that clears
    // them, and it does not re-run on output change — so re-arming here on a
    // regenerate/restore/save would strand them `true` forever.
    if (opening) {
      setLoadingPreview(true);
    }
  }

  // A connected node is selected when `selected` isn't one of the fixed rail keys.
  const isNodeSelected = !["prompt", "details", "request"].includes(selected);
  const selectedNode = isNodeSelected
    ? preview.connected.find((c) => c.nodeId === selected) ?? null
    : null;

  // The Image Gen still the motion prompt is grounded on (vision frame).
  const visionFrame = upstream.find((u) => u.type === "image-gen" && !!u.fileUrl) ?? null;

  const dirty = (output ?? "") !== draft && draft.trim() !== "";
  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : output
      ? "result"
      : "empty";

  async function fetchVersions() {
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
      setEvalNote(active?.note ?? "");
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    if (!open) return;
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
  }, [open, nodeId, slices]);

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
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Motion prompt generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
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

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key) ? slices.filter((k) => k !== key) : [...slices, key];
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
          <div className="mx-auto w-full max-w-6xl px-6 pb-5 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
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
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Read the approved still and write how it should move.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && <UsagePopover versions={versions} />}
                {mode === "result" && dirty && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    Unsaved changes
                  </span>
                )}
                {mode === "result" && (
                  <Button size="lg" onClick={handleSave} disabled={!dirty}>
                    Save
                  </Button>
                )}
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
          </div>
        </div>

        {/* Body: left rail + detail pane */}
        <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 overflow-hidden">
          {/* Rail */}
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem
              icon={<Clapperboard className="size-4 text-primary" />}
              label="Prompt"
              active={selected === "prompt"}
              onClick={() => setSelected("prompt")}
            />

            <div className="px-2.5 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Connected · {upstream.length}
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
            {/* Prompt — the compose editor (instruction on top, output below) */}
            {selected === "prompt" && (
              <div className="flex h-full w-full max-w-3xl min-h-0 flex-col overflow-y-auto">
                {/* Frame (left) + instruction & controls (right) — on top */}
                <div className="flex shrink-0 gap-5 border-b border-border px-6 py-5">
                  <div className="flex w-40 shrink-0 flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-primary" />
                      <span className="text-eyebrow">Frame</span>
                    </div>
                    {visionFrame?.fileUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={visionFrame.fileUrl}
                        alt="Approved still the motion prompt is grounded on"
                        className="max-h-48 w-auto max-w-full self-start rounded-lg border border-border object-contain"
                      />
                    ) : (
                      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        Connect an approved image to ground the motion.
                      </p>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                      placeholder={DEFAULT_MOTION_INSTRUCTION}
                      upstream={upstream}
                      disabled={!editable}
                      className="min-h-20"
                    />
                    <VideoControlsRow
                      controls={controls ?? DEFAULT_VIDEO_CONTROLS}
                      onChange={(next) => onPatch({ controls: next })}
                    />
                    <Button
                      className="w-full"
                      size="default"
                      onClick={runGenerate}
                      disabled={generating || !editable}
                    >
                      <Clapperboard className="size-4" />
                      {generating ? "Generating…" : output ? "Re-generate" : "Generate motion prompt"}
                    </Button>
                  </div>
                </div>

                {/* Output zone — the main focus, below the instruction */}
                <div className="flex shrink-0 flex-col gap-3 px-6 py-5">
                  <div className="flex items-center justify-between gap-2">
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
                    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
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
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="h-64 resize-none rounded-xl p-4 text-base leading-relaxed [field-sizing:fixed]"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Connected node — read-only detail */}
            {isNodeSelected &&
              (selectedNode ? (
                <ConnectedDetailView node={selectedNode} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 py-6">
                  <p className="text-sm text-muted-foreground">
                    {loadingPreview ? "Loading…" : "This input has no preview yet."}
                  </p>
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
                        canApprove={editable && identity?.role === "senior"}
                        onSet={saveApproval}
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
    </Sheet>
  );
}
