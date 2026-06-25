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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  imageGenClientModelGroups,
  type ClientModelSpec,
} from "@/lib/image-gen/client-models";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ParamControl } from "./param-controls";
import { ImageGenParamRow } from "./image-gen-param-row";
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

const MODEL_ITEMS: Record<string, string> = Object.fromEntries(
  imageGenClientModelGroups.flatMap((g) => g.models.map((m) => [m.id, m.label])),
);

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

  const advancedParams = model.params
    .filter((p: ParamSpec) => p.group === "advanced" && p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  return (
    <div className="space-y-2">
      {/* Model selector */}
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

      {/* Primary params */}
      {primaryParams.map((param: ParamSpec) => (
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
      ))}

      {/* Advanced params — collapsible accordion */}
      {advancedParams.length > 0 && (
        <Accordion multiple={false} className="pt-1">
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger className="py-1 text-[0.7rem] tracking-wide uppercase text-muted-foreground hover:text-foreground hover:no-underline">
              Advanced
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="space-y-2">
                {advancedParams.map((param: ParamSpec) => (
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
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
