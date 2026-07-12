"use client";

import { Video, Gauge, type LucideIcon } from "lucide-react";
import {
  VIDEO_CONTROLS,
  type VideoControls,
  type VideoControlKey,
} from "@/lib/nodes/video-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ICONS: Record<VideoControlKey, LucideIcon> = {
  camera: Video,
  speed: Gauge,
};

// Master video controls (camera move / motion speed) for the Video Prompt node (D24). Set
// values are injected into the compiled motion prompt as constraints the model must honor.
// "Auto" = no constraint.
export function VideoControlsRow({
  controls,
  onChange,
}: {
  controls: VideoControls;
  onChange: (next: VideoControls) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      {VIDEO_CONTROLS.map((group) => {
        const Icon = ICONS[group.key];
        return (
          <div key={group.key} className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{group.label}</span>
            </div>
            <Select
              value={controls[group.key]}
              onValueChange={(value) =>
                onChange({ ...controls, [group.key]: value as string })
              }
            >
              <SelectTrigger size="sm" className="w-full min-w-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {group.options.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
