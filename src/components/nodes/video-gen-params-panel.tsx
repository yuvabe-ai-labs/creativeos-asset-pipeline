"use client";

import {
  Cpu,
  Crop,
  Gauge,
  LayoutGrid,
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
  videoGenClientModelMap,
  videoGenClientModelGroups,
} from "@/lib/video-gen/client-models";
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
};

// Which section of the settings this instance renders — each is its own top-level group.
export type VideoGenParamsSection = "main" | "fine-tune" | "advanced";

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onModelChange: (modelId: string) => void;
  onParamChange: (name: string, value: unknown) => void;
  lockedParams?: Record<string, unknown>;
  lockedParamReasons?: Record<string, string>;
  section?: VideoGenParamsSection;
};

export function VideoGenParamsPanel({
  modelId,
  params,
  onModelChange,
  onParamChange,
  lockedParams = {},
  lockedParamReasons = {},
  section = "main",
}: Props) {
  const model = videoGenClientModelMap[modelId];
  const visibleParams = (model?.params ?? [])
    .filter((p: ParamSpec) => p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  const primaryParams = visibleParams.filter((p: ParamSpec) => p.group === "primary");
  const advancedParams = visibleParams.filter((p: ParamSpec) => p.group === "advanced");

  const primaryRows = primaryParams;
  const advancedRows = advancedParams;

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

  // ── Advanced section: cfg / negative prompt etc. (its own top-level group) ──
  if (section === "advanced") {
    if (advancedRows.length === 0) return null;
    return (
      <TooltipProvider>
        <div className="flex flex-col gap-4">{advancedRows.map(renderParamRow)}</div>
      </TooltipProvider>
    );
  }

  // ── Main section: model + primary params ──
  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Model — grouped chips in a 3-column grid, one block per provider. */}
        <div className="space-y-2">
          <FieldLabel icon={Cpu} label="Model" />
          <div className="space-y-2 rounded-xl border border-border p-2.5">
            {videoGenClientModelGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                <span className="text-[0.7rem] font-medium text-muted-foreground">
                  {group.label}
                </span>
                <ParamChipGroup
                  columns={3}
                  options={group.models.map((m) => ({ value: m.id, label: m.label }))}
                  value={modelId}
                  onValueChange={onModelChange}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Primary params — selects pair up 2-across; sliders/textarea span full width. */}
        <div className="space-y-4">
          {(() => {
            const selectRows = primaryRows.filter((p) => p.constraints.type === "select");
            const otherRows = primaryRows.filter((p) => p.constraints.type !== "select");
            return (
              <>
                {selectRows.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    {selectRows.map(renderParamRow)}
                  </div>
                )}
                {otherRows.map(renderParamRow)}
              </>
            );
          })()}
        </div>

      </div>
    </TooltipProvider>
  );
}
