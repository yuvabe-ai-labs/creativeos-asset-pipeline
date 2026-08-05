"use client";

import {
  LayoutTemplate, Ratio, Shapes, Type, ImageDown, Layers as LayersIcon, Palette,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PostTool =
  | "templates" | "sizes" | "elements" | "text" | "connected" | "layers" | "brand";

export const POST_TOOLS: { key: PostTool; label: string; icon: LucideIcon; comingSoon?: boolean }[] = [
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "sizes", label: "Size", icon: Ratio },
  { key: "elements", label: "Elements", icon: Shapes },
  { key: "text", label: "Text", icon: Type },
  { key: "connected", label: "Connected", icon: ImageDown },
  { key: "layers", label: "Layers", icon: LayersIcon },
  { key: "brand", label: "Brand", icon: Palette, comingSoon: true },
];

type Props = {
  active: PostTool | null;
  onSelect: (tool: PostTool | null) => void;
};

/** Clicking the active tool closes its panel, so the rail toggles rather than only opening. */
export function PostToolRail({ active, onSelect }: Props) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
      {POST_TOOLS.map(({ key, label, icon: Icon, comingSoon }) => (
        <Button
          key={key}
          variant="ghost"
          onClick={() => onSelect(active === key ? null : key)}
          aria-pressed={active === key}
          title={comingSoon ? `${label} — coming soon` : label}
          className={cn(
            "h-auto w-12 flex-col gap-1 rounded-md px-0 py-2 text-[0.6rem] font-medium",
            active === key && "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" strokeWidth={1.5} />
          {label}
          {comingSoon && <span className="text-[0.5rem] text-muted-foreground">soon</span>}
        </Button>
      ))}
    </div>
  );
}
