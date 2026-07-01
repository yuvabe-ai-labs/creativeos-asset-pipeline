"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  Palette,
  Aperture,
  PencilLine,
  Link2,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { ShotControlsRow } from "./shot-controls-row";
import {
  deriveShotControlDefaults,
  DEFAULT_SHOT_CONTROLS,
  type ShotControls,
} from "@/lib/nodes/shot-controls";
import {
  ConnectedInputsCard,
  ConnectedDetailView,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import {
  PromptVersionHistory,
  type VersionSummary,
} from "./prompt-version-history";
import { UsagePopover } from "./prompt-usage-popover";
import { InlineEvalBar } from "./inline-eval-bar";
import { InlineApprovalBar } from "./inline-approval-bar";
import { setVersionLabelAction } from "@/lib/actions/eval";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import { useIdentity } from "@/hooks/use-identity";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import type { ApprovalStatus } from "@/lib/approval";

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
          <Icon className="size-3.5 text-primary" />
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
  const [draft, setDraft] = useState(output ?? "");
  // Local mirror of the instruction prop. The textarea is controlled by THIS, not
  // by the prop directly: the prop round-trips through zustand + React Flow's
  // internal node store, so binding the textarea straight to it re-renders the
  // input with a not-yet-synced value and the browser resets the caret to the end
  // on every keystroke. Local state updates synchronously, so the caret is kept.
  const [instructionDraft, setInstructionDraft] = useState(instruction);
  const [generating, setGenerating] = useState(false);
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
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // When set, the body shows a read-only full view of that connected input.
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
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
    setDetailNodeId(null); // return to composition on open / fresh generation
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
      setLoadingVersions(true);
      setLoadingPreview(true);
    }
  }

  const detailNode = detailNodeId
    ? preview.connected.find((c) => c.nodeId === detailNodeId) ?? null
    : null;

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

  useEffect(() => {
    if (!open) return;
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
      } finally {
        if (!cancelled) setLoadingVersions(false);
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
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instructionDraft, slices, controls: controls ?? DEFAULT_SHOT_CONTROLS }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Prompt generated");
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
    const next = slices.includes(key)
      ? slices.filter((k) => k !== key)
      : [...slices, key];
    onPatch({ kbSlices: next });
  }

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
          <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Image prompt"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Compose context into a generated image prompt.
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
              </div>
            </header>
          </div>
        </div>

        {/* Body — constrained to max-w-5xl, matching script node width */}
        <div className="min-h-0 flex-1 flex justify-center overflow-hidden">
          {detailNode ? (
            <ConnectedDetailView node={detailNode} onBack={() => setDetailNodeId(null)} />
          ) : (
          <div className="w-full max-w-5xl flex min-h-0 overflow-hidden">
            {/* Left panel — Version history + Brand KB + Connected inputs */}
            <div className="w-[45%] border-r border-border overflow-hidden px-6 py-6 flex flex-col gap-6">
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
                <PromptVersionHistory
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onRestore={handleRestoreVersion}
                  restoring={restoring}
                />
              ) : null}

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

              <LeftSection icon={Aperture} label="Shot controls">
                <ShotControlsRow
                  controls={controls ?? DEFAULT_SHOT_CONTROLS}
                  onChange={(next) => onPatch({ controls: next })}
                />
              </LeftSection>

              <LeftSection
                icon={Link2}
                label="Connected"
                badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
              >
                <div className="max-h-72 overflow-y-auto pb-2">
                  {loadingPreview ? (
                    <div className="space-y-2">
                      {Array.from({ length: Math.max(upstream.length, 2) }).map((_, i) => (
                        <div key={i} className="space-y-1.5 rounded-lg border border-border p-3">
                          <div className="h-3 w-1/3 animate-pulse rounded bg-muted-foreground/20" />
                          <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/20" />
                          <div className="h-3 w-4/5 animate-pulse rounded bg-muted-foreground/20" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ConnectedInputsCard
                      upstream={upstream}
                      preview={preview.connected}
                      onOpenDetail={setDetailNodeId}
                    />
                  )}
                </div>
              </LeftSection>
            </div>

            {/* Right panel — instruction (30%) + output (70%) */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Instruction zone */}
              <div
                className="flex flex-col gap-3 px-6 py-5 border-b border-border overflow-hidden"
                style={{ flex: "3 3 0%" }}
              >
                <div className="flex items-center gap-1.5">
                  <PencilLine className="size-3.5 text-primary" />
                  <span className="text-eyebrow">Instruction</span>
                </div>
                <textarea
                  value={instructionDraft}
                  onChange={(e) => {
                    setInstructionDraft(e.target.value);
                    onPatch({ instruction: e.target.value });
                  }}
                  placeholder={instructionPlaceholder}
                  className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  className="w-full"
                  size="default"
                  onClick={runGenerate}
                  disabled={generating || !editable}
                >
                  <Sparkles className="size-4" />
                  {generating
                    ? "Generating…"
                    : output
                      ? "Re-generate"
                      : "Generate prompt"}
                </Button>
              </div>

              {/* Output zone */}
              <div
                className="flex flex-col gap-3 px-6 py-5 min-h-0 overflow-hidden"
                style={{ flex: "7 7 0%" }}
              >
                <InlineEvalBar
                  decision={evalDecision}
                  note={evalNote}
                  saving={evalSaving}
                  visible={mode === "result" && !!activeVersionId}
                  onDecision={handleEvalDecision}
                  onNote={setEvalNote}
                  onNoteBlur={handleEvalNoteBlur}
                />

                {mode === "result" && !!activeVersionId && (
                  <InlineApprovalBar
                    status={approvalStatus}
                    note={approvalNote}
                    saving={approvalSaving}
                    canApprove={editable && identity?.role === "senior"}
                    onSet={saveApproval}
                  />
                )}

                {mode === "skeleton" && (
                  <div className="flex-1 space-y-2.5 pt-1">
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
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-border">
                    <div className="text-center px-8">
                      <Sparkles className="size-8 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">
                        Not generated yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Set an instruction and click Generate.
                      </p>
                    </div>
                  </div>
                )}

                {mode === "result" && (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="flex-1 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
