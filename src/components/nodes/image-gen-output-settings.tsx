"use client";

import { useState } from "react";
import {
  Brain,
  ChevronDown,
  Cpu,
  Crop,
  FileImage,
  Gauge,
  Layers,
  LayoutGrid,
  Shield,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  imageGenClientModelGroups,
  type ImageGenClientModel,
} from "@/lib/image-gen/client-models";
import { enumOptions } from "@/lib/image-gen/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageGenParamRow } from "./image-gen-param-row";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ImageGenClientModel;
  values: ParamFormValues;
  onValuesChange: (next: ParamFormValues) => void;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
};

// Flat value→label map so the closed trigger resolves the right label before the popup mounts.
const MODEL_ITEMS: Record<string, string> = Object.fromEntries(
  imageGenClientModelGroups.flatMap((g) => g.models.map((m) => [m.id, m.label])),
);

// One styled enum select — the design-system Select used by shot-controls-row / draw-focus-view,
// replacing the native <select>. `items` lets the trigger show the label even when value ≠ label
// (e.g. "BLOCK_LOW_AND_ABOVE" → "BLOCK LOW AND ABOVE").
function ParamSelect({
  value,
  onValueChange,
  options,
  formatLabel = (v) => v,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: string[];
  formatLabel?: (v: string) => string;
}) {
  const items = Object.fromEntries(options.map((v) => [v, formatLabel(v)]));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => {
        if (v != null) onValueChange(v as string);
      }}
    >
      <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v} value={v} className="text-xs">
            {formatLabel(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const spaced = (v: string) => v.replace(/_/g, " ");

export function ImageGenOutputSettings({
  model,
  values,
  onValuesChange,
  onCommit,
  onModelChange,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fmt = (values.output_format as string | undefined) ?? "";
  const showCompression = model.provider === "openai" && (fmt === "jpeg" || fmt === "webp");
  const hasBackground =
    model.id === "openai:gpt-image-2" || model.id === "openai:gpt-image-1";
  const isPro = model.id === "gemini:gemini-3-pro-image-preview";

  // Apply updates against the current values, then persist. For live drags (e.g. the
  // compression slider) pass persist=false and commit on release — same lifted-state
  // pattern as shot-controls-row.tsx. Computing `next` once avoids reading useState
  // back before it has flushed.
  function patch(updates: ParamFormValues, persist = true) {
    const next = { ...values, ...updates };
    onValuesChange(next);
    if (persist) onCommit(next);
  }

  return (
    <div className="space-y-2">
      {/* Model — always visible */}
      <ImageGenParamRow icon={Cpu} label="Model">
        <Select
          items={MODEL_ITEMS}
          value={model.id}
          onValueChange={(v) => {
            if (v != null) onModelChange(v as string);
          }}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {imageGenClientModelGroups.map((g) => (
              <SelectGroup key={g.provider}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.models.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </ImageGenParamRow>

      {/* Basic params — always visible */}
      {model.provider === "openai" ? (
        <>
          <ImageGenParamRow icon={LayoutGrid} label="Size">
            <ParamSelect
              value={String(values.size ?? "")}
              onValueChange={(v) => patch({ size: v })}
              options={enumOptions(model, "size")}
            />
          </ImageGenParamRow>

          <ImageGenParamRow icon={Gauge} label="Quality">
            <ParamSelect
              value={String(values.quality ?? "")}
              onValueChange={(v) => patch({ quality: v })}
              options={enumOptions(model, "quality")}
            />
          </ImageGenParamRow>
        </>
      ) : (
        <>
          <ImageGenParamRow icon={Crop} label="Aspect ratio">
            <ParamSelect
              value={String(values.aspect_ratio ?? "")}
              onValueChange={(v) => patch({ aspect_ratio: v })}
              options={enumOptions(model, "aspect_ratio")}
            />
          </ImageGenParamRow>

          <ImageGenParamRow icon={LayoutGrid} label="Image size">
            <ParamSelect
              value={String(values.image_size ?? "")}
              onValueChange={(v) => patch({ image_size: v })}
              options={enumOptions(model, "image_size")}
            />
          </ImageGenParamRow>
        </>
      )}

      {/* Advanced accordion — closed by default */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-between text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="tracking-wide uppercase">Advanced</span>
          <ChevronDown
            className={cn("size-3 transition-transform duration-200", advancedOpen && "rotate-180")}
            strokeWidth={1.5}
          />
        </button>

        {advancedOpen && (
          <div className="mt-2 space-y-2">
            {model.provider === "openai" ? (
              <>
                {hasBackground && (
                  <ImageGenParamRow icon={Layers} label="Background">
                    <ParamSelect
                      value={String(values.background ?? "")}
                      onValueChange={(v) => patch({ background: v })}
                      options={enumOptions(model, "background")}
                    />
                  </ImageGenParamRow>
                )}

                <ImageGenParamRow icon={FileImage} label="Format">
                  <ParamSelect
                    value={String(values.output_format ?? "")}
                    options={enumOptions(model, "output_format")}
                    onValueChange={(v) => {
                      const updates: ParamFormValues = { output_format: v };
                      if (v !== "jpeg" && v !== "webp") updates.output_compression = undefined;
                      patch(updates);
                    }}
                  />
                </ImageGenParamRow>

                {showCompression && (
                  <label className="flex flex-col gap-1.5 pl-5">
                    <span className="text-xs text-muted-foreground">
                      Compression ({Number(values.output_compression ?? 80)})
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Number(values.output_compression ?? 80)}
                      onChange={(e) => patch({ output_compression: Number(e.target.value) }, false)}
                      onMouseUp={() => onCommit(values)}
                      onTouchEnd={() => onCommit(values)}
                      className="accent-primary"
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <ImageGenParamRow icon={FileImage} label="MIME type">
                  <ParamSelect
                    value={String(values.output_mime_type ?? "")}
                    onValueChange={(v) => patch({ output_mime_type: v })}
                    options={enumOptions(model, "output_mime_type")}
                  />
                </ImageGenParamRow>

                <ImageGenParamRow icon={Shield} label="Safety filter">
                  <ParamSelect
                    value={String(values.safety_filter_level ?? "")}
                    onValueChange={(v) => patch({ safety_filter_level: v })}
                    options={enumOptions(model, "safety_filter_level")}
                    formatLabel={spaced}
                  />
                </ImageGenParamRow>

                <ImageGenParamRow icon={User} label="Person gen">
                  <ParamSelect
                    value={String(values.person_generation ?? "")}
                    onValueChange={(v) => patch({ person_generation: v })}
                    options={enumOptions(model, "person_generation")}
                    formatLabel={spaced}
                  />
                </ImageGenParamRow>

                {isPro && (
                  <ImageGenParamRow icon={Brain} label="Thinking">
                    <ParamSelect
                      value={String(values.thinking_level ?? "")}
                      onValueChange={(v) => patch({ thinking_level: v })}
                      options={enumOptions(model, "thinking_level")}
                    />
                  </ImageGenParamRow>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
