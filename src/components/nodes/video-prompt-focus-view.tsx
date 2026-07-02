"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Palette,
  Video,
  PencilLine,
  Link2,
  ImageIcon,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditableField } from "./editable-field";
import { normalizeTitle } from "@/lib/nodes/title";
import { Button } from "@/components/ui/button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_MOTION_INSTRUCTION } from "@/lib/nodes/video-prompt";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { VideoControlsRow } from "./video-controls-row";
import { DEFAULT_VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
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
          {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

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
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
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
    const opening = open && !seed.open;
    const nodeChanged = seed.nodeId !== nodeId;
    setSeed({ open, output, nodeId });
    setDraft(output ?? "");
    setDetailNodeId(null);
    if (opening || nodeChanged) setInstructionDraft(instruction);
    if (opening) {
      setLoadingVersions(true);
      setLoadingPreview(true);
    }
  }

  const detailNode = detailNodeId
    ? preview.connected.find((c) => c.nodeId === detailNodeId) ?? null
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
              </div>
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 flex justify-center overflow-hidden">
          {detailNode ? (
            <ConnectedDetailView node={detailNode} onBack={() => setDetailNodeId(null)} />
          ) : (
            <div className="w-full max-w-5xl flex min-h-0 overflow-hidden">
              <div className="w-[45%] border-r border-border overflow-y-auto px-6 py-6 flex flex-col gap-6">
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

                <LeftSection icon={ImageIcon} label="Reading this frame">
                  {visionFrame?.fileUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={visionFrame.fileUrl}
                      alt="Approved still the motion prompt is grounded on"
                      className="max-h-40 w-auto rounded-lg border border-border object-contain"
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Connect an approved image to ground the motion.
                    </p>
                  )}
                </LeftSection>

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

                <LeftSection icon={Video} label="Motion controls">
                  <VideoControlsRow
                    controls={controls ?? DEFAULT_VIDEO_CONTROLS}
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

              <div className="flex-1 min-h-0 flex flex-col">
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
                    placeholder={DEFAULT_MOTION_INSTRUCTION}
                    className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button className="w-full" size="default" onClick={runGenerate} disabled={generating || !editable}>
                    <Clapperboard className="size-4" />
                    {generating ? "Generating…" : output ? "Re-generate" : "Generate motion prompt"}
                  </Button>
                </div>

                <div
                  className="flex flex-col gap-3 px-6 py-5 min-h-0 overflow-hidden"
                  style={{ flex: "7 7 0%" }}
                >
                  <InlineEvalBar
                    decision={evalDecision}
                    note={evalNote}
                    saving={evalSaving}
                    visible={mode === "result" && !!activeVersionId}
                    label="Generated Motion Prompt"
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
                      {Array.from({ length: 5 }).map((_, i) => (
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
                        <Clapperboard className="size-8 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">Not generated yet</p>
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          Connect a still, set an instruction, and click Generate.
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
