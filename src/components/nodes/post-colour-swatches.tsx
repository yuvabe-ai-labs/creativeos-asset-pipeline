"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A small, curated palette. Brand purple first, then the neutrals this design system
 * actually uses, then the two extremes. "Custom" hands off to the OS picker for the rare
 * case — but nobody has to open it to do ordinary work (D125).
 */
const SWATCHES: { value: string; label: string }[] = [
  { value: "#5829c7", label: "Brand purple" },
  { value: "#ffca2d", label: "Accent yellow" },
  { value: "#1e1e1e", label: "Near black" },
  { value: "#52525b", label: "Slate" },
  { value: "#9ca3af", label: "Grey" },
  { value: "#e5e7eb", label: "Light grey" },
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
];

type Props = {
  value: string;
  onChange: (colour: string) => void;
  /** Live, uncommitted update while dragging inside the OS colour picker. */
  onPreview?: (colour: string) => void;
  label: string;
};

export function PostColourSwatches({ value, onChange, onPreview, label }: Props) {
  return (
    <div>
      <label className="text-eyebrow mb-1 block !text-[0.6rem]">{label}</label>
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((s) => (
          <Button
            key={s.value}
            variant="outline"
            size="icon"
            aria-label={s.label}
            title={s.label}
            onClick={() => onChange(s.value)}
            className={cn(
              "size-6 rounded-full border p-0",
              value.toLowerCase() === s.value.toLowerCase() &&
                "ring-2 ring-primary ring-offset-1",
            )}
            style={{ backgroundColor: s.value }}
          />
        ))}
        {/* The OS picker, kept deliberately small and last — an escape hatch, not the path.
            Chrome fires `input` continuously while the pointer moves inside the picker, so
            routing that to the commit path would land one undo entry per sample — the same
            problem the sliders have. Preview on `input`, commit once on `change`. */}
        <Input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onInput={(e) => (onPreview ?? onChange)((e.target as HTMLInputElement).value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} — custom`}
          title="Custom colour"
          className="size-6 rounded-full border p-0"
        />
      </div>
    </div>
  );
}
