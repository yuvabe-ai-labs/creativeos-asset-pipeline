"use client";

import {
  Cpu,
  Crop,
  FileImage,
  Gauge,
  Layers,
  LayoutGrid,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import {
  imageGenClientModelGroups,
  type ClientModelSpec,
} from "@/lib/image-gen/client-models";
import { ParamControl } from "./param-controls";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamChipGroup } from "./param-chip-group";
import { FieldLabel } from "./field-label";
import type { ParamSpec } from "@/lib/image-gen/types";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ClientModelSpec;
  values: ParamFormValues;
  onValuesChange: (next: ParamFormValues) => void;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
};

const PARAM_ICONS: Record<string, LucideIcon> = {
  size:               LayoutGrid,
  quality:            Gauge,
  aspect_ratio:       Crop,
  image_size:         LayoutGrid,
  background:         Layers,
  output_format:      FileImage,
  output_compression: Settings2,
  duration_seconds:   Settings2,
  resolution:         Settings2,
};

// Title-case a select option for display: "low" → "Low", "1:1" / "4K" unchanged.
function formatOption(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ImageGenOutputSettings({
  model,
  values,
  onValuesChange,
  onCommit,
  onModelChange,
}: Props) {
  function patch(updates: ParamFormValues) {
    const next = { ...values, ...updates };
    onValuesChange(next);
    onCommit(next);
  }

  const primaryParams = model.params
    .filter((p: ParamSpec) => p.group === "primary" && p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  return (
    <div className="space-y-4 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-4">
      {/* Model — one chip row per provider. Deliberately NOT boxed: Model, Aspect
          ratio and Resolution are peers, and a card around only the first read as
          "this one is different". The provider sub-labels plus the tighter inner
          spacing carry the nesting on their own. */}
      <div className="space-y-3">
        <FieldLabel icon={Cpu} label="Model" />
        <div className="space-y-4">
          {imageGenClientModelGroups.map((group) => (
            <div key={group.provider} className="space-y-2">
              <span className="text-[0.65rem] font-medium tracking-wide text-foreground/70 uppercase">
                {group.label}
              </span>
              <ParamChipGroup
                options={group.models.map((m) => ({ value: m.id, label: m.label }))}
                value={model.id}
                onValueChange={onModelChange}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Primary params — each rendered as a chip group, stacked vertically so
          Quality/Resolution always sits below Aspect Ratio. */}
      <div className="flex flex-col gap-4 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-4">
        {primaryParams.map((param: ParamSpec) =>
          param.constraints.type === "select" ? (
            <div key={param.name} className="space-y-3">
              <FieldLabel
                icon={PARAM_ICONS[param.name] ?? Settings2}
                label={param.label}
              />
              <ParamChipGroup
                options={param.constraints.options.map((o) => ({
                  value: o,
                  label: formatOption(o),
                }))}
                value={String(values[param.name] ?? param.defaultValue ?? "")}
                onValueChange={(v) => patch({ [param.name]: v })}
              />
            </div>
          ) : (
            // Non-select primary params (slider/number/toggle) keep the compact
            // label-above-control cell.
            <ImageGenParamRow
              key={param.name}
              icon={PARAM_ICONS[param.name] ?? Settings2}
              label={param.label}
            >
              <ParamControl
                spec={param}
                value={values[param.name] ?? param.defaultValue}
                onChange={(v) => patch({ [param.name]: v })}
              />
            </ImageGenParamRow>
          ),
        )}
      </div>
    </div>
  );
}
