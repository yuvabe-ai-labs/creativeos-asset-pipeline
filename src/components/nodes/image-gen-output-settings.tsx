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
import type { UseFormReturn } from "react-hook-form";
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
import { ParamControl } from "./param-controls";
import { ImageGenParamRow } from "./image-gen-param-row";
import type { ParamSpec } from "@/lib/image-gen/types";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ClientModelSpec;
  form: UseFormReturn<ParamFormValues>;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
};

// Icon per param name — presentation concern, not stored in ParamSpec
const PARAM_ICONS: Record<string, LucideIcon> = {
  size:                LayoutGrid,
  quality:             Gauge,
  aspect_ratio:        Crop,
  image_size:          LayoutGrid,
  background:          Layers,
  output_format:       FileImage,
  output_compression:  Settings2,
  duration_seconds:    Settings2,
  resolution:          Settings2,
};

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function ImageGenOutputSettings({ model, form, onCommit, onModelChange }: Props) {
  const commit = () => onCommit(form.getValues());

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

      {/* Primary params */}
      {primaryParams.map((param: ParamSpec) => (
        <ImageGenParamRow
          key={param.name}
          icon={PARAM_ICONS[param.name] ?? Settings2}
          label={param.label}
        >
          <div onChange={commit}>
            <ParamControl spec={param} form={form} />
          </div>
        </ImageGenParamRow>
      ))}

      {/* Advanced params — shadcn Accordion */}
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
                    <div onChange={commit}>
                      <ParamControl spec={param} form={form} />
                    </div>
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
