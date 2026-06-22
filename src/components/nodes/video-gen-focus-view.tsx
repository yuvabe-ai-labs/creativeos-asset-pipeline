"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Clapperboard, Link2, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  videoGenClientModelMap,
  DEFAULT_VIDEO_CLIENT_MODEL_ID,
  defaultsForVideoModel,
} from "@/lib/video-gen/client-models";
import {
  VideoGenVersionHistory,
  type VideoGenVersionSummary,
} from "./video-gen-version-history";
import { VideoGenUsagePopover } from "./video-gen-usage-popover";
import type { GenerationRow } from "@/lib/db/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageRole = "start_frame" | "end_frame" | "reference";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  videoUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  imageRoles: Record<string, ImageRole>;
  onPatch: (patch: Record<string, unknown>) => void;
};

type UpstreamImage = {
  id: string;
  type: string;
  imageUrl: string;
};

// ── Main focus view ───────────────────────────────────────────────────────────

export function VideoGenFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  videoUrl,
  modelId: modelIdProp,
  params: paramsProp,
  imageRoles: imageRolesProp,
  onPatch,
}: Props) {
  const initialModelId = modelIdProp ?? DEFAULT_VIDEO_CLIENT_MODEL_ID;

  const [modelId, setModelId] = useState<string>(initialModelId);
  const [params, setParams] = useState<Record<string, unknown>>(
    () => paramsProp ?? defaultsForVideoModel(initialModelId),
  );
  const [imageRoles, setImageRoles] =
    useState<Record<string, ImageRole>>(imageRolesProp);

  const [upstreamImages, setUpstreamImages] = useState<UpstreamImage[]>([]);
  const [versions, setVersions] = useState<VideoGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Keep local imageRoles in sync when prop changes (e.g. external patch)
  useEffect(() => {
    setImageRoles(imageRolesProp);
  }, [imageRolesProp]);

  // ── fetchVersions ──────────────────────────────────────────────────────────

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        activeVersionId: string | null;
        versions: Array<{
          id: string;
          output: string | null;
          error: string | null;
          modelUsed: string | null;
          paramsUsed: Record<string, unknown>;
          createdAt: string;
        }>;
      };
      setVersions(
        (json.versions ?? []).map((v) => ({
          id: v.id,
          output: v.output ?? null,
          error: v.error ?? null,
          modelUsed: v.modelUsed ?? null,
          paramsUsed: v.paramsUsed ?? {},
          createdAt: v.createdAt,
        })),
      );
      setActiveVersionId(json.activeVersionId ?? null);
      const active = (json.versions ?? []).find(
        (v) => v.id === json.activeVersionId,
      );
      if (active?.output) onPatch({ parsed: active.output });
    } catch {
      /* best-effort */
    }
  }, [nodeId, onPatch]);

  // ── Load data on open ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    fetchVersions();
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/upstream-images`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          images: Array<{ id: string; type: string; imageUrl: string }>;
        };
        setUpstreamImages(json.images ?? []);
      } catch {
        /* best-effort */
      }
    })();
  }, [open, nodeId, fetchVersions]);

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`generation:${nodeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `node_id=eq.${nodeId}`,
        },
        (payload) => {
          const gen = payload.new as GenerationRow;
          if (gen.status === "succeeded") {
            setGenerating(false);
            fetchVersions();
            toast.success("Video ready");
          }
          if (gen.status === "failed") {
            setGenerating(false);
            toast.error(gen.error ?? "Generation failed");
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, nodeId]); // fetchVersions excluded — stable ref pattern

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleModelChange(nextModelId: string) {
    setModelId(nextModelId);
    const defaults = defaultsForVideoModel(nextModelId);
    setParams(defaults);
    onPatch({ modelId: nextModelId, params: defaults });
  }

  function handleParamChange(name: string, value: unknown) {
    const updated = { ...params, [name]: value };
    setParams(updated);
    onPatch({ params: updated });
  }

  function handleRoleChange(imageId: string, newRole: ImageRole) {
    const updated = { ...imageRoles };
    // Enforce uniqueness: demote existing holder of that role to "reference"
    if (newRole === "start_frame" || newRole === "end_frame") {
      for (const [id, role] of Object.entries(updated)) {
        if (id !== imageId && role === newRole) {
          updated[id] = "reference";
        }
      }
    }
    updated[imageId] = newRole;
    setImageRoles(updated);
    onPatch({ imageRoles: updated });
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/video-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, params, imageRoles }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? "Generation failed");
      }
      // 202 received — Realtime subscription will notify us on completion
    } catch (e) {
      setGenerating(false);
      toast.error(e instanceof Error ? e.message : "Generation failed");
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
      const json = (await res.json().catch(() => ({}))) as {
        output?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Restore failed");
      if (json.output) onPatch({ parsed: json.output });
      setActiveVersionId(versionId);
      await fetchVersions();
      toast.success("Version restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const model =
    videoGenClientModelMap[modelId] ??
    videoGenClientModelMap[DEFAULT_VIDEO_CLIENT_MODEL_ID];

  const visibleParams = model?.params.filter((p) => p.visible) ?? [];

  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : videoUrl
      ? "result"
      : "empty";

  // ── Render ─────────────────────────────────────────────────────────────────

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
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Video generation"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Choose a model, set params, and generate a video.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && (
                  <VideoGenUsagePopover versions={versions} />
                )}
                <Button
                  size="lg"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  <Sparkles className="size-4" strokeWidth={1.5} />
                  {generating
                    ? "Generating…"
                    : videoUrl
                      ? "Re-generate"
                      : "Generate"}
                </Button>
              </div>
            </header>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 flex justify-center overflow-hidden">
          <div className="w-full max-w-5xl flex min-h-0 overflow-hidden">
            {/* Left panel */}
            <div className="w-[40%] border-r border-border overflow-y-auto px-6 py-6 flex flex-col gap-6">
              {/* Version history */}
              {versions.length > 0 && (
                <VideoGenVersionHistory
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onRestore={handleRestoreVersion}
                  restoring={restoring}
                />
              )}

              {/* Model selector */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Settings2
                    className="size-3.5 text-primary"
                    strokeWidth={1.5}
                  />
                  <span className="text-eyebrow">Model</span>
                </div>
                <select
                  value={modelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {Object.values(videoGenClientModelMap).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.providerLabel})
                    </option>
                  ))}
                </select>
              </div>

              {/* Params */}
              {visibleParams.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Settings2
                      className="size-3.5 text-primary"
                      strokeWidth={1.5}
                    />
                    <span className="text-eyebrow">Parameters</span>
                  </div>
                  <div className="space-y-3">
                    {visibleParams.map((spec) => (
                      <div key={spec.name}>
                        <label className="mb-1 block text-xs font-medium text-foreground">
                          {spec.label}
                        </label>
                        {spec.component === "select" &&
                          spec.constraints.type === "select" && (
                            <select
                              value={String(
                                params[spec.name] ?? spec.defaultValue,
                              )}
                              onChange={(e) =>
                                handleParamChange(spec.name, e.target.value)
                              }
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              {spec.constraints.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}
                        {spec.component === "toggle" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleParamChange(
                                spec.name,
                                !(params[spec.name] ?? spec.defaultValue),
                              )
                            }
                            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                              params[spec.name] ?? spec.defaultValue
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <span
                              className={`size-2 rounded-full ${
                                params[spec.name] ?? spec.defaultValue
                                  ? "bg-primary"
                                  : "bg-muted-foreground/40"
                              }`}
                            />
                            {(params[spec.name] ?? spec.defaultValue)
                              ? "On"
                              : "Off"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Image inputs */}
              {upstreamImages.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Link2
                      className="size-3.5 text-primary"
                      strokeWidth={1.5}
                    />
                    <span className="text-eyebrow">Image Inputs</span>
                  </div>
                  <ul className="space-y-1.5">
                    {upstreamImages.map((img) => {
                      const role =
                        imageRoles[img.id] ??
                        (img.type === "image-gen" ? "start_frame" : "reference");
                      const roles: ImageRole[] = [
                        "start_frame",
                        "end_frame",
                        "reference",
                      ];
                      const cycleRole = () => {
                        const next =
                          roles[(roles.indexOf(role) + 1) % roles.length];
                        handleRoleChange(img.id, next);
                      };
                      return (
                        <li
                          key={img.id}
                          className="flex items-center gap-2 rounded-lg border border-border p-2"
                        >
                          <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.imageUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {img.type}
                          </span>
                          <button
                            type="button"
                            onClick={cycleRole}
                            className="shrink-0 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-[0.65rem] text-primary transition-colors hover:bg-primary/5"
                          >
                            {role.replace("_", " ")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="flex-1 min-h-0 flex flex-col px-6 py-6">
              <div className="flex-1 min-h-0">
                {mode === "skeleton" && (
                  <div className="size-full animate-pulse rounded-xl bg-muted-foreground/15" />
                )}

                {mode === "empty" && (
                  <div className="flex size-full items-center justify-center rounded-xl border border-dashed border-border">
                    <div className="text-center px-8">
                      <Clapperboard
                        className="mx-auto size-8 text-muted-foreground/40"
                        strokeWidth={1.5}
                      />
                      <p className="mt-3 text-sm font-medium text-muted-foreground">
                        Not generated yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Tune your params and click Generate.
                      </p>
                    </div>
                  </div>
                )}

                {mode === "result" && videoUrl && (
                  <div className="size-full overflow-hidden rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={videoUrl}
                      controls
                      className="max-h-full max-w-full rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
