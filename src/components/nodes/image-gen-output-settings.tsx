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
import type { UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import {
  imageGenClientModelGroups,
  type ImageGenClientModel,
} from "@/lib/image-gen/client-models";
import { enumOptions } from "@/lib/image-gen/utils";
import { ImageGenParamRow } from "./image-gen-param-row";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ImageGenClientModel;
  form: UseFormReturn<ParamFormValues>;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
};

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function ImageGenOutputSettings({ model, form, onCommit, onModelChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const values = form.watch();
  const fmt = (values.output_format as string | undefined) ?? "";
  const showCompression = model.provider === "openai" && (fmt === "jpeg" || fmt === "webp");
  const hasBackground =
    model.id === "openai:gpt-image-2" || model.id === "openai:gpt-image-1";
  const isPro = model.id === "gemini:gemini-3-pro-image-preview";

  function setField(k: string, v: unknown) {
    form.setValue(k as never, v as never, { shouldDirty: true });
  }
  const commit = () => onCommit(form.getValues());

  return (
    <div className="space-y-2">
      {/* Model — always visible */}
      <ImageGenParamRow icon={Cpu} label="Model">
        <select
          value={model.id}
          onChange={(e) => onModelChange(e.target.value)}
          className={SELECT_CLS}
        >
          {imageGenClientModelGroups.map((g) => (
            <optgroup key={g.provider} label={g.label}>
              {g.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </ImageGenParamRow>

      {/* Basic params — always visible */}
      {model.provider === "openai" ? (
        <>
          <ImageGenParamRow icon={LayoutGrid} label="Size">
            <select
              value={String(values.size ?? "")}
              onChange={(e) => { setField("size", e.target.value); commit(); }}
              className={SELECT_CLS}
            >
              {enumOptions(model, "size").map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </ImageGenParamRow>

          <ImageGenParamRow icon={Gauge} label="Quality">
            <select
              value={String(values.quality ?? "")}
              onChange={(e) => { setField("quality", e.target.value); commit(); }}
              className={SELECT_CLS}
            >
              {enumOptions(model, "quality").map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </ImageGenParamRow>
        </>
      ) : (
        <>
          <ImageGenParamRow icon={Crop} label="Aspect ratio">
            <select
              value={String(values.aspect_ratio ?? "")}
              onChange={(e) => { setField("aspect_ratio", e.target.value); commit(); }}
              className={SELECT_CLS}
            >
              {enumOptions(model, "aspect_ratio").map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </ImageGenParamRow>

          <ImageGenParamRow icon={LayoutGrid} label="Image size">
            <select
              value={String(values.image_size ?? "")}
              onChange={(e) => { setField("image_size", e.target.value); commit(); }}
              className={SELECT_CLS}
            >
              {enumOptions(model, "image_size").map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
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
                    <select
                      value={String(values.background ?? "")}
                      onChange={(e) => { setField("background", e.target.value); commit(); }}
                      className={SELECT_CLS}
                    >
                      {enumOptions(model, "background").map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </ImageGenParamRow>
                )}

                <ImageGenParamRow icon={FileImage} label="Format">
                  <select
                    value={String(values.output_format ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setField("output_format", v);
                      if (v !== "jpeg" && v !== "webp") setField("output_compression", undefined);
                      commit();
                    }}
                    className={SELECT_CLS}
                  >
                    {enumOptions(model, "output_format").map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
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
                      onChange={(e) => setField("output_compression", Number(e.target.value))}
                      onMouseUp={commit}
                      onTouchEnd={commit}
                      className="accent-primary"
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <ImageGenParamRow icon={FileImage} label="MIME type">
                  <select
                    value={String(values.output_mime_type ?? "")}
                    onChange={(e) => { setField("output_mime_type", e.target.value); commit(); }}
                    className={SELECT_CLS}
                  >
                    {enumOptions(model, "output_mime_type").map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </ImageGenParamRow>

                <ImageGenParamRow icon={Shield} label="Safety filter">
                  <select
                    value={String(values.safety_filter_level ?? "")}
                    onChange={(e) => { setField("safety_filter_level", e.target.value); commit(); }}
                    className={SELECT_CLS}
                  >
                    {enumOptions(model, "safety_filter_level").map((v) => (
                      <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </ImageGenParamRow>

                <ImageGenParamRow icon={User} label="Person gen">
                  <select
                    value={String(values.person_generation ?? "")}
                    onChange={(e) => { setField("person_generation", e.target.value); commit(); }}
                    className={SELECT_CLS}
                  >
                    {enumOptions(model, "person_generation").map((v) => (
                      <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </ImageGenParamRow>

                {isPro && (
                  <ImageGenParamRow icon={Brain} label="Thinking">
                    <select
                      value={String(values.thinking_level ?? "")}
                      onChange={(e) => { setField("thinking_level", e.target.value); commit(); }}
                      className={SELECT_CLS}
                    >
                      {enumOptions(model, "thinking_level").map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
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
