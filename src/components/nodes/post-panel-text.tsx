"use client";

import { Button } from "@/components/ui/button";
import type { TextLayer } from "@/lib/post/types";

/**
 * Three presets rather than one generic "add text" — a heading and a body differ only by
 * size and weight, and picking the right one up front is faster than restyling afterwards.
 */
const TEXT_PRESETS: { label: string; className: string; preset: Partial<TextLayer> }[] = [
  {
    label: "Heading",
    className: "text-lg font-bold",
    preset: { text: "Add a heading", fontSize: 0.055, fontWeight: 700, h: 0.09 },
  },
  {
    label: "Subheading",
    className: "text-sm font-semibold",
    preset: { text: "Add a subheading", fontSize: 0.032, fontWeight: 600, h: 0.06 },
  },
  {
    label: "Body text",
    className: "text-xs font-normal",
    preset: { text: "Add a line of body text", fontSize: 0.02, fontWeight: 400, h: 0.045 },
  },
];

export function PostPanelText({ onAddText }: { onAddText: (preset: Partial<TextLayer>) => void }) {
  return (
    <div className="space-y-2">
      {TEXT_PRESETS.map((p) => (
        <Button
          key={p.label}
          variant="outline"
          onClick={() => onAddText(p.preset)}
          className="h-auto w-full justify-start px-3 py-2.5"
        >
          <span className={p.className}>{p.label}</span>
        </Button>
      ))}
    </div>
  );
}
