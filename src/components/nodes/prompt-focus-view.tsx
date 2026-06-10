"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SliceToggles } from "./slice-toggles";
import type { KBSliceKey } from "@/lib/kb/parse-context";

type Upstream = { id: string; label: string };

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

// The Prompt node's surface — a full-width bottom sheet. Left: inputs (KB slices,
// connected nodes, instruction) + Generate. Right: the live compiled prompt and
// the generated, editable output (Save folds into the active version, D19).
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
  const [compiled, setCompiled] = useState("");
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

  // Live compiled-prompt preview — debounced; best-effort.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/compile-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, slices }),
        });
        const json = await res.json();
        if (!cancelled && res.ok) setCompiled(json.compiled ?? "");
      } catch {
        /* preview is best-effort */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, nodeId, instruction, slices]);

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
      if (json.compiled) setCompiled(json.compiled);
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
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[300px_1fr]">
            {/* Inputs */}
            <aside className="space-y-5">
              <div>
                <span className="text-eyebrow">Brand context</span>
                <SliceToggles className="mt-2" selected={slices} onToggle={toggleSlice} />
              </div>
              <div>
                <span className="text-eyebrow">Connected inputs</span>
                {upstream.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Connect a Script or Note node to feed this prompt.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {upstream.map((u) => (
                      <li key={u.id} className="rounded-md border border-border px-2.5 py-1.5 text-sm">
                        {u.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <span className="text-eyebrow">Instruction</span>
                <textarea
                  value={instruction}
                  onChange={(e) => onPatch({ instruction: e.target.value })}
                  rows={4}
                  placeholder="e.g. cinematic product hero shot, warm Ayurvedic palette…"
                  className="mt-2 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <Button className="w-full" onClick={runGenerate} disabled={generating}>
                <Sparkles className="size-4" />
                {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
              </Button>
            </aside>

            {/* Output */}
            <main className="space-y-6">
              <div>
                <span className="text-eyebrow">Final compiled prompt</span>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed text-foreground/80">
                  {compiled || "Adjust inputs to preview the compiled prompt."}
                </pre>
              </div>
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
            </main>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
