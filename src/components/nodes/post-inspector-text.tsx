"use client";

import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TextLayer } from "@/lib/post/types";
import { FONT_DEFINITIONS, type FontKey } from "@/lib/post/fonts";
import { displayFontSize, fontSizeFromDisplay } from "@/lib/post/units";
import { PostColourSwatches } from "./post-colour-swatches";
import { sliderValue } from "./post-inspector-common";

type Props = {
  layer: TextLayer;
  onChange: (patch: Partial<TextLayer>) => void;
  /** Live update while the size slider is dragged; onChange lands the single undo entry. */
  onPreview: (patch: Partial<TextLayer>) => void;
};

/** Plain-English names for the CSS weight axis — a designer picks "Bold", not "700". */
const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

/** Snap a stored weight onto the slider's 100-step grid, clamped to the real CSS range. */
function nearestWeightStep(weight: number): number {
  const clamped = Math.min(900, Math.max(100, weight));
  return Math.round(clamped / 100) * 100;
}

const ALIGN_OPTIONS = [
  { value: "left" as const, Icon: AlignLeft },
  { value: "center" as const, Icon: AlignCenter },
  { value: "right" as const, Icon: AlignRight },
];

export function PostInspectorText({ layer, onChange, onPreview }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Font</label>
        <Select value={layer.fontFamily} onValueChange={(v) => onChange({ fontFamily: v as FontKey })}>
          <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.values(FONT_DEFINITIONS)
              .filter((f) => !f.key.startsWith("noto-")) // Tamil companions aren't directly pickable — they're an automatic fallback (Task 9)
              .map((f) => (
                <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Size — {displayFontSize(layer.fontSize)}
        </label>
        <Slider
          min={8} max={400} step={1}
          value={[displayFontSize(layer.fontSize)]}
          onValueChange={(v) => onPreview({ fontSize: fontSizeFromDisplay(Array.isArray(v) ? v[0] : v) })}
          onValueCommitted={(v) => onChange({ fontSize: fontSizeFromDisplay(Array.isArray(v) ? v[0] : v) })}
        />
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Weight — {WEIGHT_LABELS[nearestWeightStep(layer.fontWeight)] ?? layer.fontWeight}
        </label>
        {/* A slider across the real CSS weight axis rather than a four-item dropdown: the
            named steps read as design language ("Light"/"Bold") instead of numbers, and the
            full 100-900 range is reachable. Snapped to 100s because the vendored families
            only ship discrete weights — a value between steps would silently round anyway. */}
        <Slider
          min={100} max={900} step={100}
          value={[nearestWeightStep(layer.fontWeight)]}
          onValueChange={(v) => onPreview({ fontWeight: Array.isArray(v) ? v[0] : v })}
          onValueCommitted={(v) => onChange({ fontWeight: Array.isArray(v) ? v[0] : v })}
        />
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          {/* Defaulted, not asserted: the field is typed required, but layers come back from
              JSONB with no schema to guarantee it, and a missing one would crash on .toFixed
              rather than degrade (D10). 1.2 is what createTextLayer seeds. */}
          Line spacing — {(layer.lineHeight ?? 1.2).toFixed(2)}
        </label>
        {/* Rendered by the Konva Text node but previously unreachable, so a two-line headline
            was stuck at whatever the template author chose. 0.8 lets display type tuck up
            tight; 2.5 is airy body copy. */}
        <Slider
          min={0.8} max={2.5} step={0.05}
          value={[layer.lineHeight ?? 1.2]}
          onValueChange={(v) => onPreview({ lineHeight: sliderValue(v) })}
          onValueCommitted={(v) => onChange({ lineHeight: sliderValue(v) })}
        />
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Letter spacing — {layer.letterSpacing ?? 0}
        </label>
        {/* Every template's eyebrow ("LIMITED-TIME OFFER") is tracked out this way; until now
            you could not do the same to your own. Negative tightens. */}
        <Slider
          min={-2} max={20} step={1}
          value={[layer.letterSpacing ?? 0]}
          onValueChange={(v) => onPreview({ letterSpacing: sliderValue(v) })}
          onValueCommitted={(v) => onChange({ letterSpacing: sliderValue(v) })}
        />
      </div>
      <PostColourSwatches
        label="Colour"
        value={layer.color}
        onChange={(color) => onChange({ color })}
        onPreview={(color) => onPreview({ color })}
      />
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Align</label>
        <div className="flex gap-1">
          {ALIGN_OPTIONS.map(({ value, Icon }) => (
            <Button
              key={value}
              variant="outline" size="icon"
              className={cn(layer.align === value && "ring-2 ring-primary ring-offset-1")}
              onClick={() => onChange({ align: value })}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
