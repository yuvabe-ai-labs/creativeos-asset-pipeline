"use client";

import {
  Cpu,
  Crop,
  Gauge,
  LayoutGrid,
  Maximize2,
  Move,
  Settings2,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamControl } from "./param-controls";
import { ParamChipGroup } from "./param-chip-group";
import { FieldLabel } from "./field-label";
import type { ParamSpec } from "@/lib/image-gen/types";

const PARAM_ICONS: Record<string, LucideIcon> = {
  aspect_ratio:        Crop,
  duration:            Timer,
  seconds:             Timer,
  size:                LayoutGrid,
  mode:                Gauge,
  cfg_scale:           Settings2,
  negative_prompt:     Settings2,
  pan:                 Move,
  tilt:                Move,
  zoom:                Maximize2,
  roll:                Move,
  horizontal_movement: Move,
  vertical_movement:   Move,
};

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onModelChange: (modelId: string) => void;
  onParamChange: (name: string, value: unknown) => void;
  lockedParams?: Record<string, unknown>;
  lockedParamReasons?: Record<string, string>;
};

// Models grouped by provider, preserving the map's declaration order.
const MODEL_GROUPS = (() => {
  const models = Object.values(videoGenClientModelMap);
  const order: string[] = [];
  for (const m of models) if (!order.includes(m.providerLabel)) order.push(m.providerLabel);
  return order.map((label) => ({
    label,
    models: models.filter((m) => m.providerLabel === label),
  }));
})();

export function VideoGenParamsPanel({
  modelId,
  params,
  onModelChange,
  onParamChange,
  lockedParams = {},
  lockedParamReasons = {},
}: Props) {
  const model = videoGenClientModelMap[modelId];
  const visibleParams = (model?.params ?? [])
    .filter((p: ParamSpec) => p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  const primaryParams = visibleParams.filter((p: ParamSpec) => p.group === "primary");
  const advancedParams = visibleParams.filter((p: ParamSpec) => p.group === "advanced");

  function renderParamRow(spec: ParamSpec) {
    const isLocked = spec.name in lockedParams;
    const reason = lockedParamReasons[spec.name];

    // Select params → horizontal chip group. Locked params are shown disabled with
    // the locked value active and a tooltip explaining why.
    if (spec.constraints.type === "select") {
      const options = spec.constraints.options.map((o) => ({ value: o, label: o }));
      const value = String(
        (isLocked ? lockedParams[spec.name] : params[spec.name]) ?? spec.defaultValue ?? "",
      );
      const chips = (
        <ParamChipGroup
          options={options}
          value={value}
          onValueChange={(v) => onParamChange(spec.name, v)}
          disabled={isLocked}
        />
      );
      return (
        <div key={spec.name} className="space-y-2">
          <FieldLabel icon={PARAM_ICONS[spec.name] ?? Settings2} label={spec.label} />
          {isLocked && reason ? (
            <Tooltip>
              <TooltipTrigger render={<div className="w-fit" />}>{chips}</TooltipTrigger>
              <TooltipContent side="top">{reason}</TooltipContent>
            </Tooltip>
          ) : (
            chips
          )}
        </div>
      );
    }

    // Non-select params (slider / number / toggle / textarea) keep the compact
    // label-above-control cell.
    return (
      <ImageGenParamRow
        key={spec.name}
        icon={PARAM_ICONS[spec.name] ?? Settings2}
        label={spec.label}
      >
        <ParamControl
          spec={spec}
          value={params[spec.name] ?? spec.defaultValue}
          onChange={(v) => onParamChange(spec.name, v)}
        />
      </ImageGenParamRow>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Model — grouped chips inside a card, one chip row per provider. */}
        <div className="space-y-2">
          <FieldLabel icon={Cpu} label="Model" />
          <div className="space-y-3 rounded-xl border border-border p-3">
            {MODEL_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <span className="text-[0.7rem] font-medium text-muted-foreground">
                  {group.label}
                </span>
                <ParamChipGroup
                  options={group.models.map((m) => ({ value: m.id, label: m.label }))}
                  value={modelId}
                  onValueChange={onModelChange}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Primary params — stacked chip groups */}
        <div className="flex flex-col gap-5">{primaryParams.map(renderParamRow)}</div>

        {/* Advanced params — collapsed accordion */}
        {advancedParams.length > 0 && (
          <Accordion multiple={false} className="pt-1">
            <AccordionItem value="advanced" className="border-none">
              <AccordionTrigger className="py-1 text-[0.7rem] tracking-wide uppercase text-muted-foreground hover:text-foreground hover:no-underline">
                Advanced
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="flex flex-col gap-5">
                  {advancedParams.map(renderParamRow)}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </TooltipProvider>
  );
}
