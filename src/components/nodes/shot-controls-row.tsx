"use client";

import { Aperture, Crop, Sun, type LucideIcon } from "lucide-react";
import {
  SHOT_CONTROLS,
  type ShotControls,
  type ShotControlKey,
} from "@/lib/nodes/shot-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ICONS: Record<ShotControlKey, LucideIcon> = {
  lens: Aperture,
  composition: Crop,
  lighting: Sun,
};

// Per-shot descriptive controls (lens / composition / lighting). Set values are injected into
// the compiled prompt as constraints the model must honor (PRD §12). "Auto" = no constraint.
export function ShotControlsRow({
  controls,
  onChange,
}: {
  controls: ShotControls;
  onChange: (next: ShotControls) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      {SHOT_CONTROLS.map((group) => {
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
