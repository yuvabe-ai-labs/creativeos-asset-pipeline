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
          value={params[spec.name] ?? spec.defaultValue}
          onChange={(v) => onParamChange(spec.name, v)}
        />
      );

    // Uniform cell: a FieldLabel (icon + name) above the control, so selects and sliders
    // share the same label weight/size (e.g. Mode and CFG Scale sit on one row, matched).
    return (
      <div key={spec.name} className="space-y-2">
        <FieldLabel icon={PARAM_ICONS[spec.name] ?? Settings2} label={spec.label} />
        {isLocked && reason ? (
          <Tooltip>
            <TooltipTrigger render={<div className="w-fit" />}>{control}</TooltipTrigger>
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
                  options={group.models.map((m) => ({ value: m.id, label: m.label }))}
                  value={modelId}
                  onValueChange={onModelChange}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Params — compact controls (selects + sliders) pair 2-across with matching labels;
            a textarea (negative prompt) spans full width below. */}
        <div className="space-y-4">
          {(() => {
            const inlineRows = visibleParams.filter((p) => p.constraints.type !== "textarea");
            const blockRows = visibleParams.filter((p) => p.constraints.type === "textarea");
            return (
              <>
                {inlineRows.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    {inlineRows.map(renderParamRow)}
                  </div>
                )}
                {blockRows.map(renderParamRow)}
              </>
            );
          })()}
        </div>

      </div>
    </TooltipProvider>
  );
}
