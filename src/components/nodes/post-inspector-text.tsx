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

type Props = { layer: TextLayer; onChange: (patch: Partial<TextLayer>) => void };

const ALIGN_OPTIONS = [
  { value: "left" as const, Icon: AlignLeft },
  { value: "center" as const, Icon: AlignCenter },
  { value: "right" as const, Icon: AlignRight },
];

export function PostInspectorText({ layer, onChange }: Props) {
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
          min={8} max={200} step={1}
          value={[displayFontSize(layer.fontSize)]}
          onValueChange={(v) => onChange({ fontSize: fontSizeFromDisplay(Array.isArray(v) ? v[0] : v) })}
        />
      </div>
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Weight</label>
        <Select
          value={String(layer.fontWeight)}
          onValueChange={(v) => onChange({ fontWeight: Number(v) })}
        >
          <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[400, 500, 600, 700].map((w) => (
              <SelectItem key={w} value={String(w)} className="text-xs">{w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PostColourSwatches
        label="Colour"
        value={layer.color}
        onChange={(color) => onChange({ color })}
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
