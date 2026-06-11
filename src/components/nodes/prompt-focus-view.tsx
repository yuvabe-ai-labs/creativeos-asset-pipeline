"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Palette,
  Link2,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";
import type { KBSliceKey } from "@/lib/kb/parse-context";

type Upstream = { id: string; label: string };
type ConnectedPreview = { nodeId: string; label: string; text: string };

type PromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  output: string | null;
  slices: KBSliceKey[];
  upstream: Upstream[];
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveOutput: (output: string) => Promise<void>;
};

// A labeled context section: icon + eyebrow label + optional source badge + body.
function ContextCard({
  icon: Icon,
  label,
  badge,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary" />
          <span className="text-eyebrow">{label}</span>
        </div>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// The Prompt node's surface — a full-width bottom sheet. The body is a single
// column of three context cards (Ambient brand KB, Connected upstream nodes, Inline
// instruction), then Generate, then the generated, editable output (Save folds into
// the active version, D19).
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
  const [draft, setDraft] = useState(output ?? "");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ ambient: string; connected: ConnectedPreview[] }>({
    ambient: "",
    connected: [],
  });
  const [seed, setSeed] = useState<{ open: boolean; output: string | null }>({ open, output });

  // Reseed the editable draft when the view opens or a fresh generation lands
  // (state-during-render, React's documented alternative to a reset effect).
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

  // Live context preview — debounced; best-effort. Ambient + connected depend only
  // on the node's edges and KB slices (not the instruction), so we key on slices.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/compile-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slices }),
        });
        const json = await res.json();
        if (!cancelled && res.ok) {
          setPreview({ ambient: json.ambient ?? "", connected: json.connected ?? [] });
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
      toast.success("Prompt generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
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
          <div className="mx-auto w-full max-w-3xl px-6 pb-5 pt-3">
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

              {mode === "result" && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="lg" onClick={runGenerate}>
                    <RefreshCw className="size-4 text-primary" /> Re-generate
                  </Button>
                  {dirty && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Unsaved changes
                    </span>
                  )}
                  <Button size="lg" onClick={handleSave} disabled={!dirty}>
                    Save
                  </Button>
                </div>
              )}
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
            {/* Ambient — brand KB */}
            <ContextCard icon={Palette} label="Ambient · Brand KB" badge="Brand KB">
              <SliceToggles selected={slices} onToggle={toggleSlice} />
              {preview.ambient.trim() ? (
                <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                  {preview.ambient}
                </pre>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No brand context selected.</p>
              )}
            </ContextCard>

            {/* Connected — upstream nodes */}
            <ContextCard
              icon={Link2}
              label="Connected · Inputs"
              badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
            >
              {upstream.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Connect a Script or Note node to feed this prompt.
                </p>
              ) : (
                <ul className="space-y-2">
                  {upstream.map((u) => {
                    const text = preview.connected.find((c) => c.nodeId === u.id)?.text ?? "";
                    return (
                      <li key={u.id} className="rounded-md border border-border px-3 py-2">
                        <span className="text-xs font-semibold text-foreground">{u.label}</span>
                        {text.trim() && (
                          <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
                            {text}
                          </pre>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ContextCard>

            {/* Inline — instruction */}
            <ContextCard icon={PencilLine} label="Inline · Instruction" badge="Instruction">
              <textarea
                value={instruction}
                onChange={(e) => onPatch({ instruction: e.target.value })}
                rows={4}
                placeholder="e.g. cinematic product hero shot, warm Ayurvedic palette…"
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {!instruction.trim() && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Will send: <span className="italic">{DEFAULT_INSTRUCTION}</span>
                </p>
              )}
            </ContextCard>

            <Button className="w-full" size="lg" onClick={runGenerate} disabled={generating}>
              <Sparkles className="size-4" />
              {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
            </Button>

            {/* Generated output */}
            <div>
              <span className="text-eyebrow">Generated prompt</span>
              {mode === "skeleton" ? (
                <div className="mt-2 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : mode === "empty" ? (
                <p className="mt-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Not generated yet. Set an instruction and click Generate.
                </p>
              ) : (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
