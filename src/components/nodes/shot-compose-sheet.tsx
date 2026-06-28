"use client";

import { useState } from "react";
import { Sparkles, Check, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { SHOT_ROLES, DEFAULT_SHOT_ROLE } from "@/lib/nodes/shot-roles";
import type { ShotComposeIdea } from "@/lib/nodes/shot-compose";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

type Props = {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// The Shot Composer sheet (D28). Pick a role -> Compose -> 4 idea cards -> "Use this" rewrites
// the shot description (edit-at-source) + captures the pick; multi-select promotes to siblings.
export function ShotComposeSheet({ nodeId, open, onOpenChange }: Props) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const promoteIdeasToShots = useCanvasStore((s) => s.promoteIdeasToShots);
  // Reactive read of THIS shot's current script (to preserve other fields when we set the desc).
  const currentScript = useCanvasStore(
    (s) => (s.nodes.find((n) => n.id === nodeId)?.data as { script?: ReelScript } | undefined)?.script,
  );

  const seedDescription = currentScript?.visual_script?.shots?.[0]?.description ?? "";

  const [role, setRole] = useState<string>(DEFAULT_SHOT_ROLE);
  const [slices] = useState<KBSliceKey[]>(DEFAULT_PARSE_SLICES);
  const [ideas, setIdeas] = useState<ShotComposeIdea[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set()); // indices marked for promote

  async function compose() {
    setLoading(true);
    setError(null);
    setIdeas([]);
    setPicked(new Set());
    try {
      const res = await fetch(`/api/nodes/${nodeId}/compose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, slices }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Compose failed");
      setIdeas(json.ideas ?? []);
      setVersionId(json.versionId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compose failed");
    } finally {
      setLoading(false);
    }
  }

  // Write the chosen idea into this Shot's description (edit-at-source) + capture the pick.
  function applyIdea(idea: ShotComposeIdea, index: number) {
    const base = (currentScript ?? {}) as ReelScript;
    const vs = base.visual_script ?? {};
    const first = vs.shots?.[0] ?? {};
    updateNodeData(nodeId, {
      script: { ...base, visual_script: { ...vs, shots: [{ ...first, description: idea.description }] } },
    });
    // best-effort capture of the selection (eval flywheel) — don't block the UI on it
    if (versionId) {
      void fetch(`/api/nodes/${nodeId}/compose/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId, selectedIndex: index, finalDescription: idea.description }),
      });
    }
    onOpenChange(false);
  }

  function togglePick(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function promote() {
    const chosen = [...picked].sort((a, b) => a - b).map((i) => ideas[i]).filter(Boolean);
    if (chosen.length === 0) return;
    promoteIdeasToShots(nodeId, chosen);
    onOpenChange(false);
  }

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        {/* drag handle — matches the other focus views */}
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        {/* header */}
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
                <SheetTitle className="flex items-center gap-2 p-0 font-display text-3xl font-semibold tracking-tight">
                  <Sparkles className="size-6 text-primary" strokeWidth={1.5} /> Compose variations
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  4 role-aware directions for this shot. Use one, or promote several to compare.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Select value={role} onValueChange={(v) => setRole(v as string)}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_ROLES.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="lg" onClick={compose} disabled={loading}>
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" strokeWidth={1.5} />
                  )}
                  Compose
                </Button>
              </div>
            </header>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 py-6">
            <p className="text-eyebrow mb-1 text-[0.6rem]!">Current shot</p>
            <p className="mb-6 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {seedDescription || "(no shot text yet)"}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <Skeleton className="mb-2 h-4 w-1/3" />
                    <Skeleton className="mb-1 h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}

              {error && <p className="col-span-full text-sm text-destructive">{error}</p>}

              {!loading && !error && ideas.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center gap-2 py-20 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full bg-primary/5">
                    <Sparkles className="size-5 text-primary/60" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-foreground">No variations yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Pick a role and press Compose to generate 4 role-aware directions for this shot.
                  </p>
                </div>
              )}

              {!loading &&
                ideas.map((idea, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border border-border bg-card p-3 shadow-card transition-all",
                      picked.has(i) && "ring-2 ring-primary",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium">{idea.title}</span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => togglePick(i)}
                              aria-label={picked.has(i) ? "Unmark for promote" : "Mark for promote"}
                              className={cn(
                                "flex size-5 items-center justify-center rounded border transition-colors",
                                picked.has(i)
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border hover:border-primary/50 hover:bg-primary/5",
                              )}
                            >
                              {picked.has(i) && <Check className="size-3.5" />}
                            </button>
                          }
                        />
                        <TooltipContent>
                          {picked.has(i) ? "Selected to promote" : "Select to promote into its own Shot"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {idea.bestFor && (
                      <p className="text-eyebrow mb-1 text-[0.6rem]!">best for · {idea.bestFor}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{idea.description}</p>
                    <div className="mt-2 flex justify-end">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button variant="outline" size="sm" onClick={() => applyIdea(idea, i)}>
                              Use this shot
                            </Button>
                          }
                        />
                        <TooltipContent>Replace this shot&apos;s description with this idea</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* footer */}
        {picked.size >= 1 && (
          <div className="shrink-0 border-t">
            <div className="mx-auto w-full max-w-5xl px-6 py-3">
              <Button className="w-full" onClick={promote}>
                Promote {picked.size} to sibling shot{picked.size > 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
