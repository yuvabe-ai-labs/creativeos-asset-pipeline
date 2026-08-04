"use client";

import { Input } from "@/components/ui/input";
import type { IconLayer } from "@/lib/post/types";

type Props = { layer: IconLayer; onChange: (patch: Partial<IconLayer>) => void };

export function PostInspectorIcon({ layer, onChange }: Props) {
  if (layer.src.kind === "url") {
    return <p className="text-xs text-muted-foreground">Uploaded icon — colour is fixed to the source image.</p>;
  }
  return (
    <div>
      <label className="text-eyebrow mb-1 block !text-[0.6rem]">Colour</label>
      <Input
        type="color" value={layer.color ?? "#1e1e1e"}
        onChange={(e) => onChange({ color: e.target.value })}
        className="h-8 w-full p-1"
      />
    </div>
  );
}
