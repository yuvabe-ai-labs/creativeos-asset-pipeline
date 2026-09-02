"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Sparkles,
  Check,
  Loader2,
  ArrowLeft,
  Plus,
  Tag,
  Clapperboard,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { SHOT_ROLES, DEFAULT_SHOT_ROLE } from "@/lib/nodes/shot-roles";
import {
  sequenceFits,
  type ShotComposeIdea,
  type ShotComposeSequence,
} from "@/lib/nodes/shot-compose";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditableField } from "./editable-field";
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

// Section heading — icon + tracked small-caps eyebrow, matching the other focus views.
function SectionLabel({
  icon: Icon,
  className,
  children,
}: {
  icon: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Icon className="size-3.5 text-primary" strokeWidth={1.5} />
      <span className="text-eyebrow">{children}</span>
    </div>
  );
}

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

  // D201 — a multishot shot composes whole SEQUENCES, not alternatives for one description.
  // Same `> 1` rule the motion path uses: a one-beat node toggled to multishot has no ladder to
  // compose against, so it keeps the single-shot composer.
  const beats = currentScript?.visual_script?.shots ?? [];
  const nodeMultishot = useCanvasStore(
    (s) => (s.nodes.find((n) => n.id === nodeId)?.data as { multishot?: boolean } | undefined)?.multishot,
  );
  const isMultishot = nodeMultishot === true && beats.length > 1;

  // Connected image references wired into the Shot's image handle — surfaced as
  // "composition references" (the same edges+nodes store derivation other nodes use).
  // Mirrors the server-side selectImageUpstreams: file(image)/draw/image-gen only.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const referenceImages = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
    return nodes
      .filter((n) => sourceIds.includes(n.id))
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        const url =
          n.type === "draw"
            ? (d.fileUrl as string | undefined)
            : n.type === "file"
              ? (d.fileKind === "image" ? (d.fileUrl as string | undefined) : undefined)
              : n.type === "image-gen"
                ? (d.parsed as string | undefined)
                : undefined;
        if (!url) return null;
        const label =
          (d.title as string) || (d.filename as string) || (n.type === "draw" ? "Sketch" : "Image");
        return { id: n.id, label, url };
      })
      .filter(Boolean) as { id: string; label: string; url: string }[];
  }, [nodes, edges, nodeId]);

  const [role, setRole] = useState<string>(DEFAULT_SHOT_ROLE);
  const [slices] = useState<KBSliceKey[]>(DEFAULT_PARSE_SLICES);
  const [ideas, setIdeas] = useState<ShotComposeIdea[]>([]);
  const [sequences, setSequences] = useState<ShotComposeSequence[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set()); // indices marked for promote
  const hydratedRef = useRef(false);

  // On first open after a canvas reload, rehydrate the last compose run (ideas + role)
  // from the captured node_versions row (D28). In-session reopens keep current state.
  useEffect(() => {
    if (!open || hydratedRef.current) return;
    hydratedRef.current = true;
    setHydrating(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/compose`);
        const json = await res.json();
        if (cancelled || !res.ok) return;
        if (json.ideas?.length || json.sequences?.length) {
          setIdeas(json.ideas ?? []);
          setSequences(json.sequences ?? []);
          setVersionId(json.versionId ?? null);
          if (json.role) {
            setRole(json.role);
            updateNodeData(nodeId, { role: json.role });
          }
        }
      } catch {
        /* best-effort — leave the empty state if it fails */
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

  async function compose() {
    setLoading(true);
    setError(null);
    setIdeas([]);
    setSequences([]);
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
      setSequences(json.sequences ?? []);
      setVersionId(json.versionId ?? null);
      updateNodeData(nodeId, { role });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compose failed");
    } finally {
      setLoading(false);
    }
  }

  // Write a description into this Shot's script (edit-at-source), preserving
  // every other script field. Shared by "Use this shot" and the inline editor.
  function setShotDescription(description: string) {
    const base = (currentScript ?? {}) as ReelScript;
    const vs = base.visual_script ?? {};
    const first = vs.shots?.[0] ?? {};
    updateNodeData(nodeId, {
      script: { ...base, visual_script: { ...vs, shots: [{ ...first, description }] } },
    });
  }

  // Write the chosen idea into this Shot's description (edit-at-source) + capture the pick.
  function applyIdea(idea: ShotComposeIdea, index: number) {
    setShotDescription(idea.description);
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

  /**
   * D201 — apply a whole sequence: EVERY beat's description, index-aligned.
   *
   * Writing only the first would leave the rest holding their old descriptions, silently mixing
   * two directions inside one clip. `sequenceFits` is checked first for the same reason — the
   * model's beat count is not trusted, and a mismatch is refused with its reason rather than
   * partially applied.
   */
  function applySequence(sequence: ShotComposeSequence, index: number) {
    const fit = sequenceFits(sequence, beats.length);
    if (!fit.ok) {
      setError(fit.reason);
      return;
    }

    const base = (currentScript ?? {}) as ReelScript;
    const vs = base.visual_script ?? {};
    updateNodeData(nodeId, {
      script: {
        ...base,
        visual_script: {
          ...vs,
          // Each beat keeps its own timing and every other field — only the description changes.
          shots: beats.map((shot, i) => ({ ...shot, description: sequence.beats[i] })),
        },
      },
    });

    if (versionId) {
      void fetch(`/api/nodes/${nodeId}/compose/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          versionId,
          selectedIndex: index,
          finalDescription: sequence.beats.join("\n"),
        }),
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
        {/* header */}
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-auto p-0 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </Button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="flex items-center gap-2 p-0 font-display text-3xl font-semibold tracking-tight">
                  <Sparkles className="size-6 text-primary" strokeWidth={1.5} /> Compose variations
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {isMultishot
                    ? `3 role-aware directions for this ${beats.length}-beat sequence. Using one rewrites every beat.`
                    : "4 role-aware directions for this shot. Use one, or promote several to compare."}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Promote is single-shot only: a sequence is one clip's worth of cuts, so
                    "promote to sibling shots" would split a direction apart into unrelated nodes. */}
                {!isMultishot && picked.size >= 1 && (
                  <Button variant="secondary" size="lg" onClick={promote}>
                    Promote {picked.size} to sibling shot{picked.size > 1 ? "s" : ""}
                  </Button>
                )}
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

        {/* body — two columns like the image-gen focus view */}
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
          <div className="flex min-h-0 w-full max-w-5xl overflow-hidden">
            {/* LEFT — inputs */}
            <div className="flex w-[30%] flex-col gap-6 overflow-y-auto border-r border-border px-6 py-6">
              <div>
                <SectionLabel icon={Tag} className="mb-2">Role</SectionLabel>
                <Select value={role} onValueChange={(v) => setRole(v as string)}>
                  <SelectTrigger className="w-full">
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
              </div>

              <div className="min-w-0">
                <SectionLabel icon={Clapperboard} className="mb-2">
                  {isMultishot ? `Current beats · ${beats.length}` : "Current shot"}
                </SectionLabel>
                {isMultishot ? (
                  // Read-only here on purpose: editing one beat in place is the Shot node's job.
                  // This column exists so the operator can see what each direction is replacing.
                  <ol className="min-w-0 space-y-1.5">
                    {beats.map((beat, i) => (
                      <li key={i} className="flex min-w-0 gap-2">
                        <span className="w-4 shrink-0 text-right text-[0.7rem] font-medium text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/80">
                          {(beat.description ?? "").trim() || (
                            <span className="italic text-muted-foreground">No description</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EditableField
                    value={seedDescription}
                    onCommit={setShotDescription}
                    multiline
                    placeholder="Describe this shot…"
                    className="text-sm leading-relaxed text-foreground/80"
                  />
                )}
              </div>

              {referenceImages.length > 0 && (
                <div>
                  <SectionLabel icon={ImageIcon} className="mb-2">
                    Composition references · {referenceImages.length}
                  </SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {referenceImages.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5 pr-2.5 shadow-card"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url} alt={r.label} className="size-16 rounded object-cover" />
                        <span className="max-w-32 truncate text-xs text-muted-foreground">{r.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[0.65rem] text-muted-foreground">
                    Ideas will echo these references&apos; palette, surface, and props.
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT — variations */}
            <div className="flex min-h-0 flex-1 flex-col py-6">
              <div className="shrink-0 px-6">
                <SectionLabel icon={Sparkles}>Variations</SectionLabel>
              </div>

              <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-4">
                {/* Sequences stack in ONE column: each card is a whole ladder, and two of them
                    side by side leave no room to read a beat. Ideas keep their two-up grid. */}
                <div className={cn("grid gap-4", !isMultishot && "sm:grid-cols-2")}>
                  {(loading || hydrating) &&
                    Array.from({ length: isMultishot ? 3 : 4 }).map((_, i) => (
                      <div key={i} className="rounded-lg border border-border p-3">
                        <Skeleton className="mb-2 h-4 w-1/3" />
                        <Skeleton className="mb-1 h-3 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    ))}

                  {error && <p className="col-span-full text-sm text-destructive">{error}</p>}

                  {!loading && !hydrating && !error && ideas.length === 0 && sequences.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center gap-2 py-20 text-center">
                      <div className="flex size-11 items-center justify-center rounded-full bg-primary/5">
                        <Sparkles className="size-5 text-primary/60" strokeWidth={1.5} />
                      </div>
                      <p className="text-sm font-medium text-foreground">No variations yet</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        {isMultishot
                          ? `Pick a role and press Compose to generate 3 cut sequences, each with one beat per beat of this shot.`
                          : "Pick a role and press Compose to generate 4 role-aware directions for this shot."}
                      </p>
                    </div>
                  )}

                  {/* D201 — sequence cards. The beats are numbered and listed in full: the
                      choice being made is between whole ladders, so a card that showed only a
                      summary would hide the thing being chosen. */}
                  {!loading && !hydrating &&
                    sequences.map((sequence, i) => {
                      const fit = sequenceFits(sequence, beats.length);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "min-w-0 rounded-xl border bg-card p-4 shadow-card transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                            fit.ok
                              ? "border-border hover:-translate-y-0.5 hover:border-primary/40"
                              : "border-destructive/40",
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{sequence.title}</span>
                            <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                              {sequence.beats?.length ?? 0} beats
                            </span>
                          </div>
                          {sequence.bestFor && (
                            <p className="text-eyebrow mb-2 text-[0.6rem]!">best for · {sequence.bestFor}</p>
                          )}

                          <ol className="space-y-1.5">
                            {(sequence.beats ?? []).map((beat, b) => (
                              <li key={b} className="flex min-w-0 gap-2">
                                <span className="w-4 shrink-0 text-right text-[0.7rem] font-medium text-primary/70">
                                  {b + 1}
                                </span>
                                <span className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                                  {beat}
                                </span>
                              </li>
                            ))}
                          </ol>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            {/* The refusal reason sits ON the card, next to the disabled button —
                                it is a fact about this direction, not a transient toast. */}
                            <span className="min-w-0 flex-1 text-xs text-destructive">
                              {fit.ok ? "" : fit.reason}
                            </span>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!fit.ok}
                              onClick={() => applySequence(sequence, i)}
                            >
                              Use this sequence
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                  {!loading && !hydrating &&
                    ideas.map((idea, i) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-xl border bg-card p-4 shadow-card transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          picked.has(i)
                            ? "border-primary bg-primary/[0.03] ring-1 ring-primary/40"
                            : "border-border hover:-translate-y-0.5 hover:border-primary/40",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium">{idea.title}</span>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => togglePick(i)}
                                  aria-label={picked.has(i) ? "Unmark for promote" : "Mark for promote"}
                                  className={cn(
                                    "size-6 rounded-md border",
                                    picked.has(i)
                                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                                      : "border-muted-foreground/40 bg-background hover:border-primary hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5",
                                  )}
                                >
                                  {picked.has(i) ? (
                                    <Check className="size-3.5" />
                                  ) : (
                                    <Plus className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                                  )}
                                </Button>
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
                                <Button variant="secondary" size="sm" onClick={() => applyIdea(idea, i)}>
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
          </div>
        </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
