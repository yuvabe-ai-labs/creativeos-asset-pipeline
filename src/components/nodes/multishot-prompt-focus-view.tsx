"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ListVideo,
  Palette,
  PencilLine,
  BadgeCheck,
  ExternalLink,
  Sun,
  RefreshCw,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { mentionDialect, imageRefDialect } from "@/lib/nodes/prompt-token-dialect";
import { FieldLabel } from "./field-label";
import { SliceToggles } from "./slice-toggles";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { visionAttachmentsOf, isVisionAttachment } from "@/lib/nodes/compose-message";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { ReferenceImageStrip } from "./reference-image-strip";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { NodeIcon, type UpstreamNode, type ConnectedPreview } from "./connected-inputs-card";
import type { VersionSummary } from "./prompt-version-history";
import { InlineEvalBar } from "./inline-eval-bar";
import { ModelRequestPanel } from "./model-request-panel";
import { setVersionLabelAction } from "@/lib/actions/eval";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import type { ApprovalStatus } from "@/lib/approval";
import { GeneratedPromptBody } from "./generated-prompt-body";
import { ApprovalStatusBadge } from "@/components/review/approval-status-badge";
import { LeftSection } from "./focus-left-section";
import { PromptFocusShell } from "./prompt-focus-shell";
import { MultishotBeatCard } from "./multishot-beat-card";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { renderPlan, type MultishotPlan } from "@/lib/nodes/multishot-plan";

type MultishotPromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  cutInstructions: Record<string, string>;
  plan: MultishotPlan | null;
  slices: KBSliceKey[];
  // The upstream Multishot node's cut list (READ-ONLY here) and its own id, so a beat's
  // timecode click can hand focus back to the node that actually owns the budget.
  cuts: MultishotCut[];
  multishotNodeId: string | null;
  upstream: UpstreamNode[];
  onPatch: (patch: Record<string, unknown>) => void;
};

// The Multishot Prompt node's focus view (D210, §8). Wraps PromptFocusShell — the sheet frame,
// connected-inputs rail, version chips, approval controls and the live-update wiring are all the
// shell's — this file supplies only the "prompt" tab's body: three columns (Connected / Input /
// Output) plus a read-only Prompt sub-tab, and the "Details" / "Sent to model" tabs every other
// prompt-type view also renders through the same shell.
export function MultishotPromptFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  instruction,
  cutInstructions,
  plan,
  slices,
  cuts,
  multishotNodeId,
  upstream,
  onPatch,
}: MultishotPromptFocusViewProps) {
  const params = useParams<{ id: string }>();
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  // Local mirrors of the instruction / per-cut-instruction / plan props — same reasoning as
  // video-prompt-focus-view's `instructionDraft`: these round-trip through zustand + React
  // Flow's node store, and binding straight to the prop re-renders with a not-yet-synced value
  // on every keystroke. Re-seeded ONLY on open / node-switch (below) and right after an action
  // that replaces the value wholesale (Generate, Restore) — never on the echo of our own
  // per-keystroke write-through, which would fight the caret for no reason.
  const [instructionDraft, setInstructionDraft] = useState(instruction);
  const [cutDrafts, setCutDrafts] = useState<Record<string, string>>(cutInstructions);
  const [planDraft, setPlanDraft] = useState<MultishotPlan | null>(plan);
  const [outputView, setOutputView] = useState<"breakup" | "prompt">("breakup");

  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [seed, setSeed] = useState<{ open: boolean; nodeId: string }>({ open, nodeId });
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(open);
  const [inputsPersisted, setInputsPersisted] = useState(false);
  const [preview, setPreview] = useState<{ connected: ConnectedPreview[] }>({ connected: [] });
  const [selected, setSelected] = useState<string>("prompt");
  const [evalDecision, setEvalDecision] = useState<"pass" | "fail" | null>(null);
  const [evalNote, setEvalNote] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [evalSaving, setEvalSaving] = useState(false);
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const isReadOnly = !editable;
  const flushAutosave = useFlushAutosave();

  if (seed.open !== open || seed.nodeId !== nodeId) {
    const opening = open && !seed.open;
    const nodeChanged = seed.nodeId !== nodeId;
    setSeed({ open, nodeId });
    setSelected("prompt");
    setOutputView("breakup");
    if (opening || nodeChanged) {
      setInstructionDraft(instruction);
      setCutDrafts(cutInstructions);
      setPlanDraft(plan);
      setLoadingPreview(true);
      setInputsPersisted(false);
    }
  }

  const isNodeSelected = !["prompt", "details", "request"].includes(selected);
  const selectedNode = isNodeSelected
    ? preview.connected.find((c) => c.nodeId === selected) ?? null
    : null;

  // The attached images in `<IMAGE_REF_N>` order — shared by every chip editor on this node
  // (sequence steer, per-cut instructions, the look block, every beat) so a reference binds to
  // the same picture wherever it is mentioned.
  const promptRefImages = visionAttachmentsOf(upstream).map((u) => ({
    id: u.id,
    label: u.label,
    fileUrl: u.fileUrl,
  }));
  const refIdsKey = promptRefImages.map((r) => r.id).join(",");
  const refIds = useMemo(() => (refIdsKey ? refIdsKey.split(",") : []), [refIdsKey]);

  // The connected inputs that are NOT reference images (the Multishot node, a Script, …) —
  // rendered as a compact list above the reference strip. Images get the strip's bigger
  // thumbnail treatment; everything else is just a name and an icon.
  const imageIds = new Set(promptRefImages.map((r) => r.id));
  const nonImageUpstream = upstream.filter((u) => !imageIds.has(u.id));

  const estimatedCredits = estimatePromptCredits(upstream.filter(isVisionAttachment).length);

  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : planDraft
      ? "result"
      : "empty";

  // The timecodes shown on each beat card — computed the same way `renderPlan` accumulates
  // them (walk the CUTS in order, never the plan), so the ladder shown here and the one
  // actually shipped cannot disagree. Beats are already in cut order (`parsePlan` reorders
  // them server-side), so a straight zip is safe.
  const beatRows = useMemo(() => {
    if (!planDraft) return [];
    const secondsById = new Map(cuts.map((c) => [c.id, c.seconds]));
    let at = 0;
    return planDraft.beats.map((b) => {
      const seconds = secondsById.get(b.cutId) ?? 0;
      const from = at;
      at += seconds;
      return { cutId: b.cutId, text: b.text, from, to: at };
    });
  }, [planDraft, cuts]);

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
      if (!opts?.preserveEvalDraft) setEvalNote(active?.note ?? "");
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
      setApprovedByName(active?.approvedByName ?? null);
      setApprovedAt(active?.approvedAt ?? null);
    } catch {
      /* best-effort */
    }
  }

  // Same flush-then-fetch sequencing as video-prompt-focus-view: a node reached straight from
  // the guided flow exists only in the client store until autosave's debounce catches up, so
  // this flushes it before resolving inputs server-side. See that file's longer comment.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        await flushAutosave();
      } catch (err) {
        console.error("[multishot-prompt] autosave flush failed:", err);
      }
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
          setPreview({ connected: (json.connected ?? []) as ConnectedPreview[] });
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
      onPatch({ approvalStatus: status });
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
      const res = await fetch(`/api/nodes/${nodeId}/multishot-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instructionDraft,
          slices,
          cutInstructions: cutDrafts,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      setPlanDraft(json.plan as MultishotPlan);
      onPatch({ parsed: json.plan });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Multishot prompt generated");
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
      const restored = (json.output ?? null) as MultishotPlan | null;
      setPlanDraft(restored);
      onPatch({ parsed: restored });
      setActiveVersionId(versionId);
      await fetchVersions();
      toast.success("Version restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  function updateInstruction(v: string) {
    setInstructionDraft(v);
    onPatch({ instruction: v });
  }

  function updateCutInstruction(cutId: string, v: string) {
    const next = { ...cutDrafts, [cutId]: v };
    setCutDrafts(next);
    onPatch({ cutInstructions: next });
  }

  function updateLook(v: string) {
    if (!planDraft) return;
    const next: MultishotPlan = { ...planDraft, look: v };
    setPlanDraft(next);
    onPatch({ parsed: next });
  }

  function updateBeat(cutId: string, v: string) {
    if (!planDraft) return;
    const next: MultishotPlan = {
      ...planDraft,
      beats: planDraft.beats.map((b) => (b.cutId === cutId ? { ...b, text: v } : b)),
    };
    setPlanDraft(next);
    onPatch({ parsed: next });
  }

  // Both re-runs (the look block's, and each beat's) are wired to the control but not the
  // request — Task 16 owns the actual per-cut/per-look regenerate call. Left as an honest,
  // visible no-op (a toast) rather than a silently dead button.
  function rerunInert() {
    toast.info("Per-shot and look rewrites land in a later task.");
  }

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key) ? slices.filter((k) => k !== key) : [...slices, key];
    onPatch({ kbSlices: next });
  }

  // Durations belong to the Multishot node, not this one — clicking a beat's timecode hands
  // focus back to it instead of exposing a second, competing place to edit them. There is no
  // camera-pan primitive in this codebase to bring it into view; `setFocusedNodeId` is the same
  // "focus this node" seam GuidedNextButton uses (D35), so this at minimum returns the operator
  // to the canvas with that node addressed, and would light up its own sheet were one ever added.
  function focusTimings() {
    if (multishotNodeId) setFocusedNodeId(multishotNodeId);
    onOpenChange(false);
  }

  const activeRequest =
    versions.find((v) => v.id === activeVersionId)?.inputsUsed?.request ?? null;

  const reviewBadge =
    mode === "result" ? <ApprovalStatusBadge status={approvalStatus} /> : undefined;

  return (
    <PromptFocusShell
      open={open}
      onOpenChange={onOpenChange}
      nodeId={nodeId}
      title={title}
      titlePlaceholder="Multishot prompt"
      onTitleCommit={(t) => onPatch({ title: t })}
      // Every field on this node patches the moment it changes — there is no separate Save
      // step to lose, so there is nothing to confirm on close.
      dirty={false}
      lastError={lastError}
      generating={generating}
      versions={versions}
      activeVersionId={activeVersionId}
      restoring={restoring}
      onRestoreVersion={handleRestoreVersion}
      upstream={upstream}
      targetType="multishot-prompt"
      primaryRailIcon={<ListVideo className="size-4 text-primary" />}
      primaryRailLabel="Prompt"
      selected={selected}
      onSelectedChange={setSelected}
      reviewBadge={reviewBadge}
      selectedNode={selectedNode}
      isNodeSelected={isNodeSelected}
      loadingPreview={loadingPreview}
      approvalStatus={approvalStatus}
      approvalNote={approvalNote}
      approvedByName={approvedByName}
      approvedAt={approvedAt}
      approvalSaving={approvalSaving}
      onSetApproval={saveApproval}
      onLiveVersionUpdate={() => void fetchVersions({ preserveEvalDraft: true })}
    >
      {({ versionChips, approvalControls }) => (
        <>
          {selected === "prompt" && (
            <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-6 py-3">
                <Tabs value={outputView} onValueChange={(v) => setOutputView(v as "breakup" | "prompt")}>
                  <TabsList>
                    <TabsTrigger value="breakup">Breakup</TabsTrigger>
                    <TabsTrigger value="prompt">Prompt</TabsTrigger>
                  </TabsList>
                </Tabs>
                {versionChips}
              </div>

              {outputView === "prompt" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {planDraft ? (
                    <GeneratedPromptBody text={renderPlan(planDraft, cuts)} images={promptRefImages} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a multishot prompt first — this shows the exact compiled string,
                      look block and ladder together, as it ships.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {/* Column 1 — Connected: the reference pool every cut mentions from, plus
                      every other connected input. A reference no beat cites is marked — the
                      writer only cites what a shot needs, so an uncited one is normal, but a
                      connected image the finished prompt never mentions is otherwise only
                      discoverable in the rendered video. */}
                  <div className="flex h-full w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border px-4 py-4">
                    <FieldLabel icon={Link2} label="Connected" />
                    {nonImageUpstream.length > 0 && (
                      <ul className="space-y-1.5">
                        {nonImageUpstream.map((u) => (
                          <li key={u.id} className="flex items-center gap-1.5 text-xs text-foreground/80">
                            <NodeIcon type={u.type} />
                            <span className="min-w-0 flex-1 truncate">{u.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {promptRefImages.length > 0 ? (
                      <ReferenceImageStrip upstream={upstream} omni plan={planDraft} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No reference images connected — @-mention one from a cut&apos;s
                        instruction once one is.
                      </p>
                    )}
                  </div>

                  {/* Column 2 — Input: the whole-sequence steer, then one card per cut with the
                      cut's own text (read-only — it belongs to the Multishot node) above the
                      per-cut instruction. */}
                  <div className="flex h-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto border-r border-border px-6 py-4">
                    <div className="flex flex-col gap-2">
                      <FieldLabel icon={PencilLine} label="Sequence" />
                      <MentionInstructionEditor
                        value={instructionDraft}
                        onChange={updateInstruction}
                        upstream={upstream}
                        dialect={mentionDialect()}
                        disabled={isReadOnly}
                        placeholder="e.g. punchy, everyday — applies to every shot"
                        className="min-h-16"
                      />
                    </div>

                    {cuts.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Connect a Multishot node with at least one shot to write against.
                      </p>
                    )}

                    {cuts.map((cut, i) => (
                      <div key={cut.id} className="rounded-xl border border-border bg-card p-3 shadow-card">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-eyebrow text-muted-foreground">
                            Shot {i + 1} · {cut.seconds}s
                          </span>
                        </div>
                        <p className="mb-2 whitespace-pre-wrap text-xs text-foreground/70">
                          {cut.text.trim() || "No shot description yet — edit the Multishot node."}
                        </p>
                        <MentionInstructionEditor
                          value={cutDrafts[cut.id] ?? ""}
                          onChange={(v) => updateCutInstruction(cut.id, v)}
                          upstream={upstream}
                          dialect={mentionDialect()}
                          disabled={isReadOnly}
                          placeholder="Blank — the writer picks a reference"
                        />
                      </div>
                    ))}

                    <div className="mt-auto pt-2">
                      <Button
                        className="w-full"
                        onClick={runGenerate}
                        disabled={generating || isReadOnly || cuts.length === 0}
                      >
                        <ListVideo className="size-4" />
                        {generating ? "Generating…" : planDraft ? "Re-generate" : "Generate multishot prompt"}
                        {!generating && <EstimatedCreditsLabel credits={estimatedCredits} />}
                      </Button>
                    </div>
                  </div>

                  {/* Column 3 — Output: the look block first (a distinct card, never numbered —
                      it governs every beat below, and rendering it as "beat 0" would say a
                      global constraint was local to shot 1), then one beat card per cut. */}
                  <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
                    <FieldLabel icon={ListVideo} label="Output" />

                    {mode === "skeleton" && (
                      <div className="space-y-2.5 pt-1">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-16 animate-pulse rounded-xl bg-muted-foreground/10"
                            style={{ width: `${85 + (i % 3) * 5}%` }}
                          />
                        ))}
                      </div>
                    )}

                    {mode === "empty" && (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border">
                        <div className="px-8 text-center">
                          <ListVideo className="mx-auto mb-3 size-8 text-muted-foreground/40" strokeWidth={1.5} />
                          <p className="text-sm font-medium text-muted-foreground">Not written yet</p>
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            Write per-cut instructions (optional) and click Generate.
                          </p>
                        </div>
                      </div>
                    )}

                    {mode === "result" && planDraft && (
                      <>
                        <div className="rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <Sun className="size-3.5 text-primary" strokeWidth={1.5} />
                            <span className="text-eyebrow text-primary">Look &amp; atmosphere</span>
                            <Button
                              variant="ghost"
                              onClick={rerunInert}
                              disabled={isReadOnly}
                              aria-label="Rewrite the look"
                              className="ml-auto h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
                            >
                              <RefreshCw className="size-3.5" strokeWidth={1.5} />
                            </Button>
                          </div>
                          <MentionInstructionEditor
                            value={planDraft.look}
                            onChange={updateLook}
                            upstream={upstream}
                            dialect={imageRefDialect(refIds)}
                            disabled={isReadOnly}
                          />
                          <p className="mt-2 text-[0.65rem] text-muted-foreground">
                            Governs every beat below.
                          </p>
                        </div>

                        {beatRows.map((beat, i) => (
                          <MultishotBeatCard
                            key={beat.cutId}
                            index={i}
                            from={beat.from}
                            to={beat.to}
                            text={beat.text}
                            upstream={upstream}
                            refIds={refIds}
                            onChange={(v) => updateBeat(beat.cutId, v)}
                            onRerun={rerunInert}
                            onFocusTimings={focusTimings}
                            disabled={isReadOnly}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
                    {approvalControls}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Generate a multishot prompt first to review and approve it.
                  </p>
                )}
              </LeftSection>
            </div>
          )}

          {selected === "request" && (
            <div className="flex h-full w-full max-w-3xl min-h-0 flex-col overflow-y-auto px-6 py-6">
              {activeRequest ? (
                <ModelRequestPanel request={activeRequest} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No request recorded for this version — generate a multishot prompt to capture
                  the system prompt, compiled input, and attachments sent to the model.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </PromptFocusShell>
  );
}
