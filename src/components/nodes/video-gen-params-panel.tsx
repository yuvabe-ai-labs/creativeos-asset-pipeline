"use client";

import {
  Cpu,
  Crop,
  LayoutGrid,
  Lock,
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
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
          const isLocked = spec.name in lockedParams;
          return (
            <ImageGenParamRow
              key={spec.name}
              icon={PARAM_ICONS[spec.name] ?? Settings2}
              label={spec.label}
            >
              {isLocked ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="flex-1 text-xs text-foreground">
                    {String(lockedParams[spec.name])}s
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <Lock
                        className="size-3 shrink-0 text-muted-foreground/50"
                        strokeWidth={1.5}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {lockedParamReasons[spec.name]}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <ParamControl
                  spec={spec}
                  value={params[spec.name] ?? spec.defaultValue}
                  onChange={(v) => onParamChange(spec.name, v)}
                />
              )}
            </ImageGenParamRow>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
