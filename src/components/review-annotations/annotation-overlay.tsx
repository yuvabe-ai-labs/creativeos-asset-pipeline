"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AnnotationPin } from "./annotation-pin";
import { AnnotationNotePopover } from "./annotation-note-popover";
import type { RegionBounds } from "@/lib/review-annotations/payload";

export type OverlayAnnotation = {
  id: string;
  seq: number;
  note: string;
  maskUrl: string | null;
  bounds: RegionBounds | null;
  authorLine: string | null;
};

// Where annotation n's pin goes. D218: on its own region, at the centre of the painted
// bounding box — the same anchor compose mode uses, so a pin does not move between
// writing the note and reading it.
//
// Pre-D218 rows have no bounds. Those fall back to the original left-edge stack: the mask
// is still the locator, the pin is just an index into the notes.
function pinPosition(bounds: RegionBounds | null, index: number) {
  if (!bounds) return { x: 0.04, y: 0.06 + index * 0.08 };
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

// Read-only annotation layer (D214): the stored painted overlays render directly — they
// ARE the purple strokes the senior drew — pins open note popovers, one toggle hides it
// all so the maker can see the untouched picture underneath.
export function AnnotationOverlay({
  annotations,
}: {
  annotations: OverlayAnnotation[];
}) {
  const [visible, setVisible] = useState(true);
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  if (annotations.length === 0) return null;
  const openIndex = annotations.findIndex((a) => a.seq === openSeq);
  const open = openIndex === -1 ? null : annotations[openIndex];
  return (
    <>
      <div className="absolute right-2 top-2 z-20">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setVisible((v) => !v)}
          className="bg-background/80 backdrop-blur-sm"
          aria-pressed={visible}
        >
          Annotations {visible ? "\u2713" : "\u00b7"} {annotations.length}
        </Button>
      </div>
      {visible && (
        <>
          {annotations.map((a) =>
            a.maskUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={a.maskUrl}
                alt=""
                className="pointer-events-none absolute inset-0 size-full object-contain opacity-40"
              />
            ) : null,
          )}
          {annotations.map((a, i) => {
            const { x, y } = pinPosition(a.bounds, i);
            return (
              <AnnotationPin
                key={a.id}
                seq={a.seq}
                x={x}
                y={y}
                active={openSeq === a.seq}
                onClick={() => setOpenSeq(openSeq === a.seq ? null : a.seq)}
              />
            );
          })}
          {open && (
            <AnnotationNotePopover
              mode="read"
              seq={open.seq}
              note={open.note}
              authorLine={open.authorLine}
              // Anchor the card under the region itself when we know where it is;
              // otherwise under the stacked pin, as before.
              bounds={
                open.bounds ?? {
                  x: 0.08,
                  y: 0.06 + openIndex * 0.08,
                  w: 0,
                  h: 0,
                }
              }
            />
          )}
        </>
      )}
    </>
  );
}
