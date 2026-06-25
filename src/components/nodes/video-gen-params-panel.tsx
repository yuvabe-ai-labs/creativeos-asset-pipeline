"use client";

import {
  Cpu,
  Crop,
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
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamControl } from "./param-controls";

const PARAM_ICONS: Record<string, LucideIcon> = {
  aspect_ratio: Crop,
  duration:     Timer,
  seconds:      Timer,
  size:         LayoutGrid,
};

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

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
  const model = videoGenClientModelMap[modelId];
  const visibleParams = model?.params.filter((p) => p.visible) ?? [];

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Model row */}
        <ImageGenParamRow icon={Cpu} label="Model">
          <select
            value={modelId}
            onChange={(e) => onModelChange(e.target.value)}
            className={SELECT_CLS}
          >
            {Object.values(videoGenClientModelMap).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.providerLabel})
              </option>
            ))}
          </select>
        </ImageGenParamRow>

        {/* Param rows */}
        {visibleParams.map((spec) => {
          const lockedValue = lockedParams[spec.name];
          const isLocked = spec.name in lockedParams;
          const reason = lockedParamReasons[spec.name];

          // For select params with a locked value: show all options but disable invalid ones.
          // Matches Google AI Studio behaviour — the user sees context, not a blank read-only field.
          if (isLocked && spec.constraints.type === "select") {
            const options = spec.constraints.options;
            return (
              <ImageGenParamRow
                key={spec.name}
                icon={PARAM_ICONS[spec.name] ?? Settings2}
                label={spec.label}
              >
                <Tooltip>
                  <TooltipTrigger render={<span className="min-w-0 flex-1" />}>
                    <select
                      value={String(lockedValue)}
                      onChange={() => {}}
                      className={SELECT_CLS}
                    >
                      {options.map((opt) => (
                        <option key={opt} value={opt} disabled={opt !== String(lockedValue)}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </TooltipTrigger>
                  {reason && (
                    <TooltipContent side="top">{reason}</TooltipContent>
                  )}
                </Tooltip>
              </ImageGenParamRow>
            );
          }

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
        })}
      </div>
    </TooltipProvider>
  );
}
