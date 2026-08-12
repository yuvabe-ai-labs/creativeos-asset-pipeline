"use client";

import { ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Fill } from "@/lib/post/types";
import {
  GRADIENT_PRESETS, GRADIENT_DIRECTIONS, angleToDirection, makeGradientFill,
  type GradientDirection,
} from "@/lib/post/gradients";

const DIRECTION_ICONS: Record<GradientDirection, typeof ArrowDown> = {
  down: ArrowDown,
  up: ArrowUp,
  right: ArrowRight,
  left: ArrowLeft,
};

/**
 * CSS angle for the swatch preview. Our angle is degrees clockwise from "down" (0 = down,
 * 90 = right, 180 = up, 270 = left — see gradients.ts), while CSS `linear-gradient()` angles
 * are degrees clockwise from "up" (0deg = to top, 90deg = to right, 180deg = to bottom,
 * 270deg = to left). Those two references run in opposite rotational sense relative to each
 * other once you align them at a shared point, so the conversion is a reflection
 * (`180 - angle`), not a shift (`angle + 180`): `180 - angle` maps our 0/90/180/270 (down/
 * right/up/left) to CSS 180/90/0/270 (to bottom/to right/to top/to left) — verified against
 * all four directions, not just the vertical pair where a plain `+180` also happens to work.
 */
function previewCss(from: string, to: string, angle: number): string {
  return `linear-gradient(${(180 - angle + 360) % 360}deg, ${from}, ${to})`;
}

type Props = {
  from: string;
  to: string;
  angle: number;
  onChange: (fill: Fill) => void;
};

export function PostGradientPresets({ from, to, angle, onChange }: Props) {
  const direction = angleToDirection(angle);
  const activeId = GRADIENT_PRESETS.find((p) => p.from === from && p.to === to)?.id;

  return (
    <div className="space-y-2">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Gradient</label>
        <div className="grid grid-cols-4 gap-1">
          {GRADIENT_PRESETS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              aria-label={p.label}
              title={p.label}
              onClick={() => onChange(makeGradientFill(p.id, direction))}
              className={cn(
                "h-7 w-full rounded-md border p-0",
                activeId === p.id && "ring-2 ring-primary ring-offset-1",
              )}
              style={{ backgroundImage: previewCss(p.from, p.to, angle) }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Direction</label>
        <div className="flex gap-1">
          {GRADIENT_DIRECTIONS.map((d) => {
            const Icon = DIRECTION_ICONS[d.key];
            return (
              <Button
                key={d.key}
                variant="outline"
                size="icon"
                aria-label={d.label}
                title={d.label}
                onClick={() =>
                  onChange({ kind: "gradient", from, to, angle: d.angle })
                }
                className={cn("size-7", direction === d.key && "ring-2 ring-primary ring-offset-1")}
              >
                <Icon className="size-3.5" strokeWidth={1.5} />
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
