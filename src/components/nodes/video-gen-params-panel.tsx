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
  resolveVideoModelId,
} from "@/lib/video-gen/client-models";
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

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onModelChange: (modelId: string) => void;
  onParamChange: (name: string, value: unknown) => void;
  lockedParams?: Record<string, unknown>;
  lockedParamReasons?: Record<string, string>;
};

export function VideoGenParamsPanel({
  modelId,
  params,
  onModelChange,
  onParamChange,
  lockedParams = {},
  lockedParamReasons = {},
}: Props) {
  const model = videoGenClientModelMap[resolveVideoModelId(modelId)];
  const visibleParams = (model?.params ?? [])
    .filter((p: ParamSpec) => p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  function renderParamRow(spec: ParamSpec) {
    const isLocked = spec.name in lockedParams;
    const reason = lockedParamReasons[spec.name];

    const control =
      spec.constraints.type === "select" ? (
        <ParamChipGroup
          options={spec.constraints.options.map((o) => ({ value: o, label: o }))}
          value={String(
            (isLocked ? lockedParams[spec.name] : params[spec.name]) ?? spec.defaultValue ?? "",
          )}
          onValueChange={(v) => onParamChange(spec.name, v)}
          disabled={isLocked}
        />
      ) : (
        <ParamControl
          spec={spec}
          value={(isLocked ? lockedParams[spec.name] : params[spec.name]) ?? spec.defaultValue}
          onChange={(v) => onParamChange(spec.name, v)}
          disabled={isLocked}
        />
      );

    // Uniform cell: a FieldLabel (icon + name) above the control, so every stacked param row —
    // chip select, slider, or textarea — shares the same label weight and spacing.
    return (
      <div key={spec.name} className="space-y-2">
        <FieldLabel icon={PARAM_ICONS[spec.name] ?? Settings2} label={spec.label} />
        {isLocked && reason ? (
          <Tooltip>
            <TooltipTrigger render={<div className="w-full" />}>{control}</TooltipTrigger>
            <TooltipContent side="top">{reason}</TooltipContent>
          </Tooltip>
        ) : (
          control
        )}
      </div>
    );
  }

  // ── Model + params (one flat section — no separate Advanced group) ──
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
                  options={group.models.map((m) => ({
                    value: m.id,
                    label: m.pickerLabel ?? m.label,
                  }))}
                  value={modelId}
                  onValueChange={onModelChange}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Params — the first two compact controls share the top row (Mode + Duration, or
            Aspect Ratio + Duration for Veo); any remaining controls (CFG Scale, then the
            full-width Negative Prompt) stack one below the other underneath. */}
        {(() => {
          const canPair =
            visibleParams.length >= 2 &&
            visibleParams[0].constraints.type !== "textarea" &&
            visibleParams[1].constraints.type !== "textarea";
          const rowParams = canPair ? visibleParams.slice(0, 2) : [];
          const stackParams = canPair ? visibleParams.slice(2) : visibleParams;
          return (
            <div className="space-y-4">
              {rowParams.length > 0 && (
                // Compact control (Mode / Aspect Ratio) sizes to its content; the slider
                // beside it (Duration) fills the rest of the row — no dead half-column gap.
                <div className="grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-4">
                  {rowParams.map(renderParamRow)}
                </div>
              )}
              {stackParams.map(renderParamRow)}
            </div>
          );
        })()}

      </div>
    </TooltipProvider>
  );
}
