"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  Palette,
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
import {
  ConnectedInputsCard,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import {
  PromptVersionHistory,
  type VersionSummary,
} from "./prompt-version-history";
import { UsagePopover } from "./prompt-usage-popover";

type PromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  output: string | null;
  slices: KBSliceKey[];
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
  upstream,
  onPatch,
  onSaveOutput,
}: PromptFocusViewProps) {
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState(output ?? "");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{
    ambient: string;
    connected: ConnectedPreview[];
  }>({
    ambient: "",
    connected: [],
  });
  const [seed, setSeed] = useState<{ open: boolean; output: string | null }>({
    open,
    output,
  });
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  if (seed.open !== open || seed.output !== output) {
    setSeed({ open, output });
    setDraft(output ?? "");
  }

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
      setVersions(json.versions ?? []);
      setActiveVersionId(json.activeVersionId ?? null);
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
          setVersions(json.versions ?? []);
          setActiveVersionId(json.activeVersionId ?? null);
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
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, nodeId, slices]);

  async function runGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, slices }),
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
          <div className="w-full max-w-5xl flex min-h-0 overflow-hidden">
            {/* Left panel — Version history + Brand KB + Connected inputs */}
            <div className="w-[45%] border-r border-border overflow-hidden px-6 py-6 flex flex-col gap-6">
              {versions.length > 0 && (
                <PromptVersionHistory
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onRestore={handleRestoreVersion}
                  restoring={restoring}
                />
              )}

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

              <LeftSection
                icon={Link2}
                label="Connected"
                badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
              >
                <div className="max-h-72 overflow-y-auto pb-2">
                  <ConnectedInputsCard
                    upstream={upstream}
                    preview={preview.connected}
                  />
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
                  value={instruction}
                  onChange={(e) => onPatch({ instruction: e.target.value })}
                  placeholder={instructionPlaceholder}
                  className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  className="w-full"
                  size="default"
                  onClick={runGenerate}
                  disabled={generating}
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
                <span className="text-eyebrow">Generated Prompt</span>

                {mode === "skeleton" && (
                  <div className="flex-1 space-y-2.5 pt-1">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 animate-pulse rounded bg-muted-foreground/15"
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
