"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import {
  ArrowLeft,
  Download,
  ImageIcon,
  Link2,
  Maximize2,
  Settings2,
  Sparkles,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectedInputsCard, type UpstreamNode, type ConnectedPreview } from "./connected-inputs-card";
import { ImageGenVersionHistory, type ImageGenVersionSummary } from "./image-gen-version-history";
import { ImageGenUsagePopover } from "./image-gen-usage-popover";
import { InlineEvalBar } from "./inline-eval-bar";
import { setVersionLabelAction } from "@/lib/actions/eval";
import {
  imageGenClientModelGroups,
  imageGenClientModelMap,
  DEFAULT_CLIENT_MODEL_ID,
  defaultsForSchema,
  type ImageGenClientModel,
} from "@/lib/image-gen/client-models";

export type ImageGenFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  imageUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  upstream: Array<{ id: string; type: string; fileUrl?: string; fileKind?: string }>;
  onPatch: (patch: Record<string, unknown>) => void;
};

type ParamFormValues = Record<string, unknown>;

// ── Section header (matches prompt-focus-view.tsx LeftSection pattern) ────────

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
          <Icon className="size-3.5 text-primary" strokeWidth={1.5} />
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

// ── Full-screen zoom controls (must be inside TransformWrapper) ───────────────

function ZoomControls({ onDownload }: { onDownload: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-6 inset-x-0 flex flex-col items-center gap-2 pointer-events-none z-10">
      <p className="text-[0.6rem] tracking-widest text-white/30 uppercase select-none">
        scroll to zoom · drag to pan · double-click to reset
      </p>
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomOut()}
          aria-label="Zoom out"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <ZoomOut className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => resetTransform()}
          aria-label="Fit to screen"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => zoomIn()}
          aria-label="Zoom in"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <ZoomIn className="size-3.5" strokeWidth={1.5} />
        </button>
        <div className="mx-1.5 h-3.5 w-px bg-white/20" />
        <button
          type="button"
          onClick={onDownload}
          aria-label="Download image"
          className="rounded-full p-1.5 text-white/60 transition-colors hover:text-white"
        >
          <Download className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ── Tiny native select ────────────────────────────────────────────────────────

function ParamSelect({
  label,
  value,
  onChange,
  onBlur,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  options: Array<{ value: string; label?: string }>;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-eyebrow !text-[0.6rem]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value}
          </option>
        ))}
      </select>
    </label>
  );
}

function enumOptions(model: ImageGenClientModel, field: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = model.schema as any;
  const shape = s?.shape ?? s?._def?.shape ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldDef = shape[field] as any;
  const inner = fieldDef?._def?.innerType ?? fieldDef;
  const values =
    inner?._def?.values ??
    inner?.options ??
    inner?._def?.options ??
    [];
  return Array.isArray(values) ? values : Object.values(values ?? {});
}

// ── Params form (dynamic per provider) ────────────────────────────────────────

function ParamsForm({
  model,
  form,
  onCommit,
}: {
  model: ImageGenClientModel;
  form: UseFormReturn<ParamFormValues>;
  onCommit: (values: ParamFormValues) => void;
}) {
  const values = form.watch();
  const fmt = (values.output_format as string | undefined) ?? "";
  const showCompression = model.provider === "openai" && (fmt === "jpeg" || fmt === "webp");
  const hasBackground = "background" in (values as Record<string, unknown>) ||
    model.id === "openai:gpt-image-2" || model.id === "openai:gpt-image-1";

  function setField<K extends string>(k: K, v: unknown) {
    form.setValue(k as never, v as never, { shouldDirty: true });
  }

  const commit = () => onCommit(form.getValues());

  if (model.provider === "openai") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <ParamSelect
          label="Size"
          value={String(values.size ?? "")}
          onChange={(v) => setField("size", v)}
          onBlur={commit}
          options={enumOptions(model, "size").map((v) => ({ value: v }))}
        />
        <ParamSelect
          label="Quality"
          value={String(values.quality ?? "")}
          onChange={(v) => setField("quality", v)}
          onBlur={commit}
          options={enumOptions(model, "quality").map((v) => ({ value: v }))}
        />
        {hasBackground && (
          <ParamSelect
            label="Background"
            value={String(values.background ?? "")}
            onChange={(v) => setField("background", v)}
            onBlur={commit}
            options={enumOptions(model, "background").map((v) => ({ value: v }))}
          />
        )}
        <ParamSelect
          label="Output format"
          value={String(values.output_format ?? "")}
          onChange={(v) => {
            setField("output_format", v);
            if (v !== "jpeg" && v !== "webp") setField("output_compression", undefined);
          }}
          onBlur={commit}
          options={enumOptions(model, "output_format").map((v) => ({ value: v }))}
        />
        {showCompression && (
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-eyebrow !text-[0.6rem]">
              Output compression ({Number(values.output_compression ?? 80)})
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Number(values.output_compression ?? 80)}
              onChange={(e) => setField("output_compression", Number(e.target.value))}
              onBlur={commit}
              className="accent-primary"
            />
          </label>
        )}
      </div>
    );
  }

  // Gemini
  const isPro = model.id === "gemini:gemini-3-pro-image-preview";
  return (
    <div className="grid grid-cols-2 gap-2">
      <ParamSelect
        label="Aspect ratio"
        value={String(values.aspect_ratio ?? "")}
        onChange={(v) => setField("aspect_ratio", v)}
        onBlur={commit}
        options={enumOptions(model, "aspect_ratio").map((v) => ({ value: v }))}
      />
      <ParamSelect
        label="Image size"
        value={String(values.image_size ?? "")}
        onChange={(v) => setField("image_size", v)}
        onBlur={commit}
        options={enumOptions(model, "image_size").map((v) => ({ value: v }))}
      />
      <ParamSelect
        label="Output type"
        value={String(values.output_mime_type ?? "")}
        onChange={(v) => setField("output_mime_type", v)}
        onBlur={commit}
        options={enumOptions(model, "output_mime_type").map((v) => ({ value: v }))}
      />
      <ParamSelect
        label="Safety filter"
        value={String(values.safety_filter_level ?? "")}
        onChange={(v) => setField("safety_filter_level", v)}
        onBlur={commit}
        options={enumOptions(model, "safety_filter_level").map((v) => ({
          value: v,
          label: v.replace(/_/g, " "),
        }))}
      />
      <ParamSelect
        label="Person generation"
        value={String(values.person_generation ?? "")}
        onChange={(v) => setField("person_generation", v)}
        onBlur={commit}
        options={enumOptions(model, "person_generation").map((v) => ({
          value: v,
          label: v.replace(/_/g, " "),
        }))}
      />
      {isPro && (
        <ParamSelect
          label="Thinking level"
          value={String(values.thinking_level ?? "")}
          onChange={(v) => setField("thinking_level", v)}
          onBlur={commit}
          options={enumOptions(model, "thinking_level").map((v) => ({ value: v }))}
        />
      )}
    </div>
  );
}

// ── Main focus view ───────────────────────────────────────────────────────────

export function ImageGenFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  imageUrl,
  modelId,
  params,
  upstream,
  onPatch,
}: ImageGenFocusViewProps) {
  const selectedModelId = modelId ?? DEFAULT_CLIENT_MODEL_ID;
  const model = imageGenClientModelMap[selectedModelId] ?? imageGenClientModelMap[DEFAULT_CLIENT_MODEL_ID];

  const form = useForm<ParamFormValues>({
    defaultValues: { ...defaultsForSchema(model.schema), ...(params ?? {}) },
  });

  const [generating, setGenerating] = useState(false);
  const [versions, setVersions] = useState<ImageGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [evalDecision, setEvalDecision] = useState<"pass" | "fail" | null>(null);
  const [evalNote, setEvalNote] = useState("");
  const [evalSaving, setEvalSaving] = useState(false);
  const [preview, setPreview] = useState<ConnectedPreview[]>([]);
  const seenModelIdRef = useRef(model.id);

  useEffect(() => {
    if (model.id !== seenModelIdRef.current) {
      seenModelIdRef.current = model.id;
      const defaults = defaultsForSchema(model.schema);
      form.reset(defaults);
      onPatch({ params: defaults });
    }
  }, [model, form, onPatch]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/versions`);
        if (!cancelled && res.ok) {
          const json = (await res.json()) as {
            activeVersionId: string | null;
            versions: ImageGenVersionSummary[];
          };
          setVersions(json.versions ?? []);
          setActiveVersionId(json.activeVersionId ?? null);
          const active = (json.versions ?? []).find((v) => v.id === json.activeVersionId);
          setEvalDecision(active?.decision ?? null);
          setEvalNote(active?.note ?? "");
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const promptNode = upstream.find((u) => u.type === "prompt");
    if (!promptNode) {
      setPreview([]);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${promptNode.id}/versions`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          activeVersionId: string | null;
          versions: Array<{ id: string; output: string | null }>;
        };
        const active = (json.versions ?? []).find((v) => v.id === json.activeVersionId);
        if (!cancelled && active?.output) {
          setPreview([{ nodeId: promptNode.id, type: "prompt", label: "Image prompt", text: active.output }]);
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, upstream]);

  const promptUpstream = upstream.find((u) => u.type === "prompt");
  const referenceCount = upstream.filter((u) => {
    if (u.type === "image-gen") return true;
    if (u.type === "file") return u.fileKind === "image" && !!u.fileUrl;
    if (u.type === "draw") return !!u.fileUrl;
    return false;
  }).length;
  const refOverLimit = referenceCount > model.maxReferenceImages;

  const upstreamForCard: UpstreamNode[] = useMemo(
    () =>
      upstream.map((u) => {
        const typeLabel =
          u.type === "prompt"
            ? "Image prompt"
            : u.type === "image-gen"
              ? "Image reference"
              : u.type === "draw"
                ? "Sketch"
                : u.type === "file"
                  ? "Image file"
                  : u.type;
        return {
          id: u.id,
          label: typeLabel,
          type: u.type,
          fileUrl: u.fileUrl,
          fileKind: u.fileKind,
        };
      }),
    [upstream],
  );

  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : imageUrl
      ? "result"
      : "empty";

  async function fetchVersions() {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        activeVersionId: string | null;
        versions: ImageGenVersionSummary[];
      };
      setVersions(json.versions ?? []);
      setActiveVersionId(json.activeVersionId ?? null);
      const active = (json.versions ?? []).find((v) => v.id === json.activeVersionId);
      setEvalDecision(active?.decision ?? null);
      setEvalNote(active?.note ?? "");
    } catch {
      /* best-effort */
    }
  }

  async function handleGenerate() {
    if (!promptUpstream) {
      toast.error("Connect a Prompt node first.");
      return;
    }
    setGenerating(true);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const values = form.getValues();
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, params: values }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        versionId?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl) throw new Error(json.error ?? "Generation failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Image generated");
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
      const json = (await res.json()) as { output?: string; error?: string };
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
      await setVersionLabelAction(activeVersionId, {
        decision: evalDecision,
        note: evalNote.trim() || null,
      });
    } catch {
      toast.error("Failed to save note");
    } finally {
      setEvalSaving(false);
    }
  }

  function commitParams(values: ParamFormValues) {
    onPatch({ params: values });
  }

  function changeModel(nextId: string) {
    onPatch({ modelId: nextId });
  }

  async function handleDownload() {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const filename = `${(title || "generated-image").replace(/\s+/g, "-").toLowerCase()}.${ext}`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // fallback: open in new tab for manual save
      window.open(imageUrl, "_blank");
    }
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
                  {title || "Image generation"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Choose a model, tune params, and generate an image from your connected prompt.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && <ImageGenUsagePopover versions={versions} />}
                <Button
                  size="lg"
                  onClick={handleGenerate}
                  disabled={generating || !promptUpstream}
                >
                  <Sparkles className="size-4" strokeWidth={1.5} />
                  {generating ? "Generating…" : imageUrl ? "Re-generate" : "Generate"}
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
              {versions.length > 0 && (
                <ImageGenVersionHistory
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onRestore={handleRestoreVersion}
                  restoring={restoring}
                />
              )}

              <LeftSection icon={Settings2} label="Output settings">
                <div className="flex flex-col gap-3">
                  <select
                    value={model.id}
                    onChange={(e) => changeModel(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {imageGenClientModelGroups.map((g) => (
                      <optgroup key={g.provider} label={g.label}>
                        {g.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ParamsForm model={model} form={form} onCommit={commitParams} />
                </div>
              </LeftSection>

              <LeftSection
                icon={Link2}
                label="Connected"
                badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
              >
                <ConnectedInputsCard upstream={upstreamForCard} preview={preview} />
                {refOverLimit && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[0.7rem] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
                    <span>
                      {referenceCount} reference images connected — only the first{" "}
                      {model.maxReferenceImages} will be used by {model.label}.
                    </span>
                  </div>
                )}
              </LeftSection>
            </div>

            {/* Right panel */}
            <div className="flex-1 min-h-0 flex flex-col px-6 py-6">
              <InlineEvalBar
                label="Generated Image"
                decision={evalDecision}
                note={evalNote}
                saving={evalSaving}
                visible={mode === "result" && !!activeVersionId}
                onDecision={handleEvalDecision}
                onNote={setEvalNote}
                onNoteBlur={handleEvalNoteBlur}
              />

              <div className="mt-3 flex-1 min-h-0">
                {mode === "skeleton" && (
                  <div className="size-full animate-pulse rounded-xl bg-muted-foreground/15" />
                )}

                {mode === "empty" && (
                  <div className="flex size-full items-center justify-center rounded-xl border border-dashed border-border">
                    <div className="text-center px-8">
                      <ImageIcon className="mx-auto size-8 text-muted-foreground/40" strokeWidth={1.5} />
                      <p className="mt-3 text-sm font-medium text-muted-foreground">
                        Not generated yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {promptUpstream
                          ? "Tune your params and click Generate."
                          : "Connect a Prompt node, then click Generate."}
                      </p>
                    </div>
                  </div>
                )}

                {mode === "result" && imageUrl && (
                  <div className="group relative size-full overflow-hidden rounded-xl border border-border bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={title || "Generated image"}
                      className="size-full object-contain"
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur"
                        aria-label="Download image"
                      >
                        <Download className="size-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoomOpen(true)}
                        className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur"
                      >
                        <ZoomIn className="size-3.5" strokeWidth={1.5} /> Zoom
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Full-screen zoom dialog */}
        {imageUrl && (
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent
              className={cn(
                "inset-0 left-0 top-0 translate-x-0 translate-y-0",
                "h-screen max-h-screen w-screen max-w-none",
                "rounded-none border-0 p-0 gap-0 shadow-none",
                "bg-black/95 text-white overflow-hidden",
                "flex flex-col",
              )}
            >
              <DialogTitle className="sr-only">Generated image</DialogTitle>
              <TransformWrapper
                doubleClick={{ mode: "reset" }}
                minScale={0.5}
                maxScale={8}
                centerOnInit
              >
                <TransformComponent
                  wrapperClass="!w-screen !h-screen"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={title || "Generated image"}
                    className="max-h-screen max-w-full object-contain"
                    draggable={false}
                  />
                </TransformComponent>
                <ZoomControls onDownload={handleDownload} />
              </TransformWrapper>
            </DialogContent>
          </Dialog>
        )}
      </SheetContent>
    </Sheet>
  );
}
