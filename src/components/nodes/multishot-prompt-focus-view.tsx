"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ListVideo,
  Palette,
  BadgeCheck,
  ExternalLink,
  Sun,
  RefreshCw,
  ChevronDown,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { dialectForCapability } from "@/lib/nodes/prompt-token-dialect";
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import { FieldLabel } from "./field-label";
import { SliceToggles } from "./slice-toggles";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { visionAttachmentsOf, isVisionAttachment } from "@/lib/nodes/compose-message";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { ReferenceImageStrip } from "./reference-image-strip";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { UpstreamNode, ConnectedPreview } from "./connected-inputs-card";
import type { VersionSummary } from "./prompt-version-history";
import { InlineEvalBar } from "./inline-eval-bar";
import { ModelRequestPanel } from "./model-request-panel";
import { setVersionLabelAction } from "@/lib/actions/eval";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { savePromptOutputAction } from "@/lib/actions/nodes";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import type { ApprovalStatus } from "@/lib/approval";
import { GeneratedPromptBody } from "./generated-prompt-body";
import { ApprovalStatusBadge } from "@/components/review/approval-status-badge";
import { LeftSection } from "./focus-left-section";
import { PromptFocusShell, RESERVED_RAIL_KEYS } from "./prompt-focus-shell";
import { MultishotBeatCard } from "./multishot-beat-card";
import { RefineWithAI } from "./refine-with-ai";
import { RefineProgress } from "./refine-progress";
import { planMentionables } from "@/lib/nodes/plan-mentions";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { renderPlan, refsCitedIn, planIsDirty, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import type { RefineScope } from "@/lib/nodes/refine-suggestions";

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
  /** D236 — read from the upstream Multishot node. Absent = the default (Gemini Omni). */
  targetModel?: string;
  multishotNodeId: string | null;
  upstream: UpstreamNode[];
  onPatch: (patch: Record<string, unknown>) => void;
};

const SHOW_PER_BEAT_REGENERATE = true; // the look and per-beat rewrite + refine buttons

// The Multishot Prompt node's focus view (D231, §8). Wraps PromptFocusShell — the sheet frame,
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
  targetModel,
  multishotNodeId,
  upstream,
  onPatch,
}: MultishotPromptFocusViewProps) {
  const params = useParams<{ id: string }>();
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  // The model the upstream Multishot node is currently SET to — what the next Generate will use.
  // Not what the plan on screen was written with; see `cap` below.
  const nodeCap = multishotCapabilityFor(targetModel);

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
  // One capability for the whole view: the dialect the beats are stored in, the format the prompt
  // renders in, and the token shape `refsCitedIn` scans for must all be the SAME model's. Deriving
  // them separately is how a view ends up editing @image_1 chips into a prompt rendered as a
  // timecode ladder.
  //
  // D236 — that model is THE PLAN's (its own `targetModel` stamp), not the node's current
  // setting, and it is the same value resolve-prompt.ts renders the money path against. An
  // unstamped plan is Gemini Omni's. Only with no plan yet is there nothing to misread, and then
  // the node's model is the honest guide for what the next Generate will produce.
  const cap = planDraft ? multishotCapabilityFor(planDraft.targetModel) : nodeCap;
  // D237 — STATED, never clamped. Switching the Multishot node's model does not rewrite a plan
  // already written, so the two can disagree; the operator is told, in one line, and the way out
  // is a regenerate (D239). Editing and generating both stay open.
  const modelMismatch = planDraft !== null && cap.id !== nodeCap.id;
  // The look accordion, CLOSED by default (operator request 2026-09-08). The ladder is the
  // working surface and should own the column on arrival; the look is written once and then
  // mostly left alone. Collapsed it still shows a one-line preview, so it is summarised rather
  // than hidden — which is what makes closing it safe for a block that governs every beat.
  const [lookOpen, setLookOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  // ONE in flight at a time. Two concurrent refines each resolve against the planDraft they
  // captured at submit time, so the second to return would discard the first's result with no
  // error at all. This drives every button's disabled state, not just its own.
  const [refining, setRefining] = useState<{ scope: RefineScope; cutId: string | null } | null>(
    null,
  );
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
  // What `@` offers inside a refine note: the look block, then every shot by position. Derived
  // from the CUTS rather than the plan's beats — the ladder is what the operator sees, and it
  // exists before a plan does.
  const planMentions = useMemo(() => planMentionables(cuts), [cuts]);
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

  const isNodeSelected = !RESERVED_RAIL_KEYS.includes(selected as (typeof RESERVED_RAIL_KEYS)[number]);
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

  // References no beat's text cites (via `refsCitedIn`), by index into `promptRefImages` —
  // the same order-preserving `visionAttachmentsOf(upstream)` filter ReferenceImageStrip
  // applies internally, so the indices line up without a second, independent ordering.
  //
  // Since D233 the writer no longer binds references itself, so this reads as the operator's
  // own checklist: an image marked here is one nothing has been attached to yet. Uncited is
  // still a legitimate end state — a connected image the sequence never needed — but an
  // intended reference left unattached is otherwise only discoverable in the rendered video.
  const uncitedIndices = useMemo(() => {
    if (!planDraft) return undefined;
    const cited = new Set(planDraft.beats.flatMap((b) => refsCitedIn(b.text, cap)));
    const uncited = new Set<number>();
    promptRefImages.forEach((_, i) => {
      if (!cited.has(i)) uncited.add(i);
    });
    return uncited;
  }, [planDraft, promptRefImages, cap]);

  const estimatedCredits = estimatePromptCredits(upstream.filter(isVisionAttachment).length);
  const totalCutSeconds = cuts.reduce((sum, c) => sum + c.seconds, 0);

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

  // D240 — hand edits are BUFFERED in planDraft and land in the node_versions row only on Save.
  // They used to patch the canvas store on every keystroke and never reach the database at all,
  // while `/api/nodes/[id]/upstream-images` and resolve-prompt.ts both read the version row — so
  // an edited look or beat showed on the canvas and was then silently dropped at the boundary,
  // and Video Gen billed a render against the last AI-generated plan.
  const dirty = planIsDirty(plan, planDraft);

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

  // Shared POST helper for every call to this node's runAction — a full generate, or a scoped
  // refine. One fetch/parse path so the callers below cannot drift on error handling.
  async function postMultishotPrompt(extra?: {
    scope?: "look" | "cut";
    cutId?: string;
    note?: string;
    plan?: MultishotPlan;
  }) {
    const res = await fetch(`/api/nodes/${nodeId}/multishot-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: instructionDraft,
        slices,
        cutInstructions: cutDrafts,
        ...extra,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
    }
    return json as { plan: MultishotPlan; versionId: string | null };
  }

  /**
   * A scoped rewrite: the look, one beat, or the whole plan, optionally steered by a note.
   *
   * The response is ALREADY the merged whole — the route merges the model's narrow fragment into
   * the plan we sent before it validates or records anything. So this assigns it wholesale and
   * there is nothing to splice: the beats we did not ask about came back exactly as we sent them.
   */
  async function runRefine(scope: RefineScope, opts: { cutId?: string; note?: string } = {}) {
    if (isReadOnly || refining) return; // D33, and one in flight at a time
    // A restore in flight must win outright: it replaces planDraft wholesale from a version the
    // operator explicitly chose, and a refine that started against the pre-restore plan would
    // resolve afterward and silently discard that choice, stamping its own activeVersionId over
    // it. See the matching `restoring={restoring || !!refining}` gate on the version chips above.
    if (restoring) return;
    if (scope !== "all" && !planDraft) return;

    setRefining({ scope, cutId: opts.cutId ?? null });
    if (scope === "all") {
      setLastError(null);
      setEvalDecision(null);
      setEvalNote("");
    }
    try {
      const json = await postMultishotPrompt(
        scope === "all"
          ? // The plan rides along on a whole-sequence refine too, but only as CONTEXT: it is what
            // lets a note like "change shots 5 and 6" name beats the writer can then copy back
            // verbatim. Omitted when there is none (the first generate) and ignored by the route
            // when there is no note, so a plain Generate still writes fresh.
            { note: opts.note, ...(planDraft ? { plan: planDraft } : {}) }
          : { scope, cutId: opts.cutId, note: opts.note, plan: planDraft! },
      );
      setPlanDraft(json.plan);
      onPatch({ parsed: json.plan });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success(
        scope === "look" ? "Look rewritten" : scope === "cut" ? "Shot rewritten" : "Multishot prompt generated",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Rewrite failed";
      if (scope === "all") setLastError(message);
      toast.error(message);
      await fetchVersions();
    } finally {
      setRefining(null);
    }
  }

  async function runGenerate() {
    setGenerating(true);
    try {
      await runRefine("all");
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

  // No editors for `instruction` / `cutInstructions` any longer (operator request 2026-09-08 —
  // they were added on 2026-09-04 and this node never had them before that). The values are still
  // READ from the node and still travel in every request, so a node that has them keeps its steer;
  // there is simply no longer a surface for typing new ones.

  /**
   * Persist the hand-edited plan onto the ACTIVE version, in place — no new version row. Same
   * call and same reasoning as the Motion Prompt node's handleSave (video-prompt-focus-view.tsx):
   * a hand edit is a correction to the plan the operator is holding, not a new candidate to
   * compare against, and minting a version per typo would bury the generated ones in the chips.
   */
  async function handleSavePlan() {
    if (!planDraft) return;
    try {
      await savePromptOutputAction(nodeId, planDraft);
      onPatch({ parsed: planDraft }); // mirror into the store for display + clear dirty
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  // D240 — these set planDraft ONLY. The `onPatch` that used to run per keystroke now lives in
  // handleSavePlan, beside the write that actually reaches the database.
  function updateLook(v: string) {
    if (!planDraft) return;
    setPlanDraft({ ...planDraft, look: v });
  }

  function updateBeat(cutId: string, v: string) {
    if (!planDraft) return;
    setPlanDraft({
      ...planDraft,
      beats: planDraft.beats.map((b) => (b.cutId === cutId ? { ...b, text: v } : b)),
    });
  }

  function toggleSlice(key: KBSliceKey) {
    if (isReadOnly) return; // D33: belt-and-braces — SliceToggles is also disabled below
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
      // D240 — hand edits to the plan are buffered until Save, so closing with unsaved ones must
      // confirm. (Until D240 every field patched on change and there was nothing to lose.)
      dirty={dirty}
      lastError={lastError}
      generating={generating}
      versions={versions}
      activeVersionId={activeVersionId}
      // Also gated on `refining`: a version chip switch used to race an in-flight refine —
      // click an older chip while a beat refine is in flight, and the refine's resolve would
      // overwrite planDraft with a merge computed against the pre-restore snapshot, silently
      // discarding the restore the operator just asked for. See runRefine's matching guard.
      // `dirty` joins the gate for the same reason `refining` is in it: a restore replaces
      // planDraft wholesale from a version the operator picked, silently discarding the hand
      // edits they have not saved yet (D242).
      restoring={restoring || !!refining || dirty}
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
            // Grid for the same reason as the body below: `minmax(0, 1fr)` bounds the second row
            // to the leftover height without depending on a min-h-0 chain holding all the way up.
            <div className="grid h-full w-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-6 py-3">
                <Tabs value={outputView} onValueChange={(v) => setOutputView(v as "breakup" | "prompt")}>
                  <TabsList>
                    <TabsTrigger value="breakup">Breakup</TabsTrigger>
                    <TabsTrigger value="prompt">Prompt</TabsTrigger>
                  </TabsList>
                </Tabs>
                {SHOW_PER_BEAT_REGENERATE && mode === "result" && (
                  <div className="ml-auto">
                    <RefineWithAI
                      scope="all"
                      busy={refining?.scope === "all"}
                      disabled={isReadOnly || !!refining || dirty}
                      onSubmit={(note) => runRefine("all", { note })}
                      mentionables={planMentions}
                      label="Refine the whole sequence with AI"
                    />
                  </div>
                )}
              </div>

              {outputView === "prompt" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {planDraft ? (
                    <GeneratedPromptBody text={renderPlan(planDraft, cuts, cap)} images={promptRefImages} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a multishot prompt first — this shows the exact compiled string,
                      look block and ladder together, as it ships.
                    </p>
                  )}
                </div>
              ) : (
                // Three columns (operator request 2026-09-08), the shape every other prompt node
                // uses: the shell's rail on the left, then INPUT and OUTPUT here. This replaces
                // the collapsible strip of 2026-09-03, which gave the output full width by
                // hiding the inputs behind two chips — reading order was lost, and this node was
                // the only prompt view where what you write and what came back were not side by
                // side.
                //
                // Output takes the larger share, which is what the strip was protecting: six
                // beats are long, and the earlier three-across layout boxed them into a third of
                // the screen. The Prompt tab still spans the full body.
                <div className="flex min-h-0 overflow-hidden">
                  {/* INPUT. Its own scroller, with Generate pinned to the foot of the column it
                      acts on — the same arrangement as the image and video prompt views. */}
                  <div className="flex h-full w-[42%] shrink-0 min-h-0 flex-col overflow-hidden border-r border-border bg-card">
                    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
                      {/* The references this sequence can cite. A reference no beat cites is
                          marked — since D233 the writer names a product in prose and leaves the
                          binding to the operator, so this marks what has not been attached yet.
                          Uncited stays legitimate for an image the sequence never needed. */}
                      {promptRefImages.length > 0 ? (
                        <ReferenceImageStrip
                          upstream={upstream}
                          omni
                          uncitedIndices={uncitedIndices}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No reference images connected. Connect a File, Draw or Image node and
                          the writer will cite the ones each shot calls for.
                        </p>
                      )}

                      {cuts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Connect a Multishot node with at least one shot to write against.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <FieldLabel
                            icon={ListVideo}
                            label={`Shots · ${cuts.length} · ${totalCutSeconds}s`}
                          />
                          {/* One card per cut, stacked: the cut's own text (read-only — it
                              belongs to the Multishot node) above the instruction for it. A
                              single column, because this column is now narrow and a 3-across
                              grid inside it would leave two words per line. */}
                          <div className="flex flex-col gap-2.5">
                            {cuts.map((cut, i) => (
                              <div
                                key={cut.id}
                                className="rounded-xl border border-border bg-background p-3"
                              >
                                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                                  <span className="text-eyebrow text-muted-foreground">
                                    Shot {i + 1}
                                  </span>
                                  <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                                    {cut.seconds}s
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/70">
                                  {cut.text.trim() || "No shot description yet — edit the Multishot node."}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Generate, at the foot of the column it acts on — same placement as the
                        image and video prompt views. */}
                    <div className="shrink-0 border-t border-border px-5 py-3">
                      <Button
                        className="w-full"
                        onClick={runGenerate}
                        disabled={generating || isReadOnly || cuts.length === 0 || !!refining || dirty}
                      >
                        <ListVideo className="size-4" />
                        {generating
                          ? "Generating…"
                          : planDraft
                            ? "Re-generate"
                            : "Generate multishot prompt"}
                        {!generating && <EstimatedCreditsLabel credits={estimatedCredits} />}
                      </Button>
                    </div>
                  </div>

                  {/* OUTPUT. The look block first — a distinct card, never numbered, because it
                      governs every beat below and rendering it as "beat 0" would say a global
                      constraint was local to shot 1 — then every beat as a row in one container.
                      `min-w-0` is load-bearing on a flex-1 column: without it the column cannot
                      shrink below its content's intrinsic width, the row overflows, and the
                      parent's overflow-hidden crops the output off-screen. */}
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
                    {/* The output's own eyebrow with the version chips beside it — the same row,
                        in the same place, that prompt-focus-view.tsx and video-prompt-focus-view.tsx
                        put them in. They were up in the tab strip, which is this node's chrome and
                        not where any other view keeps them.
                        items-start: the chips row can wrap, and should anchor to the top rather
                        than drift down beside a one-line label. */}
                    <div className="flex shrink-0 items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <ListVideo className="size-3.5 text-primary" strokeWidth={1.5} />
                        <span className="text-eyebrow">Generated plan</span>
                      </div>
                      {versionChips}
                    </div>

                    {/* D236/D237 — the plan on screen was written for one model and the Multishot
                        node now says another. STATED, not clamped and not blocked: the beats stay
                        editable and Generate stays live, exactly as an out-of-window ladder does
                        one node upstream. The way out is D239's — regenerate — so the sentence
                        names both models and that one action. Same shape as the ladder violation
                        on multishot-node.tsx / multishot-focus-view.tsx, so one class of problem
                        reads one way across all three surfaces. */}
                    {modelMismatch && (
                      <p className="flex shrink-0 items-start gap-1.5 text-xs text-destructive">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
                        <span>
                          Written for {cap.label} — the Multishot node is now set to{" "}
                          {nodeCap.label}. Re-generate to write this sequence for {nodeCap.label};
                          until then it ships as {cap.label}.
                        </span>
                      </p>
                    )}

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
                        {/* shrink-0 on both children, or the scroller above never scrolls. Flex
                            items shrink by default, and `min-height: auto` only refuses to shrink
                            an item whose overflow is `visible` — the beat container below sets
                            `overflow-hidden` for its rounded corners, which drops its automatic
                            minimum to 0. So the column squeezed the beats into whatever the look
                            block left over (428px of beats into 184px) and clipped the rest
                            inside their own rounded box. Nothing ever overflowed the scroller,
                            so `overflow-y-auto` had nothing to scroll: measured scrollHeight ===
                            clientHeight with six beats present. */}
                        {/* A whole-sequence refine keeps `mode === "result"` — unlike Generate, it
                            does not raise `generating`, so without this the only sign anything was
                            happening was a pulsing icon in the header, while every card sat greyed
                            out for no visible reason. */}
                        {refining?.scope === "all" && (
                          <div className="shrink-0">
                            <RefineProgress label="Rewriting the whole sequence…" />
                          </div>
                        )}

                        {/* Collapsible, closed by default (operator request 2026-09-08). The look
                            governs every beat, but it is written once and then mostly left alone
                            while the ladder below is the working surface — so the ladder gets the
                            column on arrival. The collapsed header carries a one-line preview, so
                            the look is summarised rather than hidden. */}
                        <div className="shrink-0 rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => setLookOpen((v) => !v)}
                              aria-expanded={lookOpen}
                              className="h-auto gap-1.5 rounded p-0 hover:bg-transparent dark:hover:bg-transparent"
                            >
                              <ChevronDown
                                className={cn(
                                  "size-3.5 text-primary transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                  !lookOpen && "-rotate-90",
                                )}
                                strokeWidth={1.5}
                              />
                              <Sun className="size-3.5 text-primary" strokeWidth={1.5} />
                              <span className="text-eyebrow text-primary">Look &amp; atmosphere</span>
                            </Button>
                            {!lookOpen && (
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {planDraft.look}
                              </span>
                            )}
                            {SHOW_PER_BEAT_REGENERATE && (
                              <div className="ml-auto flex items-center gap-0.5">
                                <RefineWithAI
                                  scope="look"
                                  busy={refining?.scope === "look"}
                                  disabled={isReadOnly || !!refining || dirty}
                                  onSubmit={(note) => runRefine("look", { note })}
                                  mentionables={planMentions}
                                  label="Refine the look with AI"
                                />
                                <Button
                                  variant="ghost"
                                  onClick={() => runRefine("look")}
                                  disabled={!!refining || isReadOnly || dirty}
                                  aria-label="Rewrite the look"
                                  className="h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
                                >
                                  <RefreshCw
                                    className={cn("size-3.5", refining?.scope === "look" && "animate-spin")}
                                    strokeWidth={1.5}
                                  />
                                </Button>
                              </div>
                            )}
                          </div>
                          {lookOpen && (
                            <>
                          {refining?.scope === "look" && (
                            <div className="mt-2">
                              <RefineProgress label="Rewriting the look…" hint="beats untouched" />
                            </div>
                          )}
                          {/* Locked for the duration of ANY refine, not just a look-scoped one — a
                              keystroke here during a beat or whole-plan refine still gets persisted
                              to planDraft, and then silently discarded the instant the refine
                              resolves and overwrites the whole plan with the snapshot it captured
                              before the edit. */}
                          <MentionInstructionEditor
                            value={planDraft.look}
                            onChange={updateLook}
                            upstream={upstream}
                            dialect={dialectForCapability(cap, refIds)}
                            disabled={isReadOnly || !!refining}
                          />
                          <p className="mt-2 text-[0.65rem] text-muted-foreground">
                            Governs every beat below.
                          </p>
                            </>
                          )}
                        </div>

                        <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-card">
                          {beatRows.map((beat, i) => (
                            <MultishotBeatCard
                              key={beat.cutId}
                              index={i}
                              from={beat.from}
                              to={beat.to}
                              text={beat.text}
                              upstream={upstream}
                              refIds={refIds}
                              cap={cap}
                              onChange={(v) => updateBeat(beat.cutId, v)}
                              onRerun={() => runRefine("cut", { cutId: beat.cutId })}
                              onRefine={(note) => runRefine("cut", { cutId: beat.cutId, note })}
                              mentionables={planMentions}
                              showRerun={SHOW_PER_BEAT_REGENERATE}
                              rerunning={refining?.cutId === beat.cutId}
                              onFocusTimings={focusTimings}
                              disabled={isReadOnly || (!!refining && refining.cutId !== beat.cutId)}
                              // D242 — the AI buttons only. `disabled` would also lock the editor,
                              // freezing the beat the instant it was typed into.
                              aiDisabled={dirty}
                              isLast={i === beatRows.length - 1}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    </div>

                    {/* Save, at the foot of the column it acts on — the same placement rule the
                        Generate button follows at the foot of the Input column. Rendered only
                        with a plan on screen, which is also the only state that can be dirty. */}
                    {mode === "result" && (
                      <div className="shrink-0 border-t border-border px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={handleSavePlan} disabled={!dirty}>
                            Save
                          </Button>
                          {dirty && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              Unsaved changes
                            </span>
                          )}
                        </div>
                        {/* Says why every rewrite button just dimmed. Only rendered while dirty,
                            which is the only state in which they are. */}
                        {dirty && (
                          <p className="mt-1.5 text-[0.65rem] text-muted-foreground">
                            Save or discard your edits to rewrite with AI.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {selected === "details" && (
            <div className="flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
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
                <SliceToggles selected={slices} onToggle={toggleSlice} disabled={isReadOnly} />
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
            <div className="flex w-full max-w-3xl min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
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
