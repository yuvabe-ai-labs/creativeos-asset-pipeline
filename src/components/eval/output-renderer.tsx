"use client";

import type { Modality } from "@/lib/eval/node-traces";

type Slot = { kind: Modality; text?: string; urls?: string[] };

// One renderer per modality — the type filter guarantees a homogeneous slot,
// so each branch stays single-purpose (spec §4.4).
export function OutputRenderer({ slot }: { slot: Slot }) {
  if (slot.kind === "image") {
    const urls = slot.urls ?? [];
    if (urls.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
    return (
      <div className="grid grid-cols-2 gap-2">
        {urls.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" className="w-full rounded-lg border border-border object-cover" />
        ))}
      </div>
    );
  }
  if (slot.kind === "video") {
    const url = (slot.urls ?? [])[0];
    return url ? (
      <video src={url} controls className="w-full rounded-lg border border-border" />
    ) : (
      <p className="text-xs text-muted-foreground">—</p>
    );
  }
  // text + structured
  return (
    <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
      {slot.text || "—"}
    </p>
  );
}
