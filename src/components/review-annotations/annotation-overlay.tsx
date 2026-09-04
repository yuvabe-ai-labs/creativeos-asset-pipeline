"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AnnotationPin } from "./annotation-pin";
import { AnnotationNotePopover } from "./annotation-note-popover";

export type OverlayAnnotation = {
  id: string;
  seq: number;
  note: string;
  maskUrl: string | null;
  authorLine: string | null;
};

// Read-only annotation layer (D214): the stored painted overlays render directly — they
// ARE the purple strokes the senior drew — pins open note popovers, one toggle hides it
// all so the maker can see the untouched picture underneath.
//
// Stored rows carry no bounds, so a pin cannot be placed on its own region without
// reading mask pixels client-side. Pins therefore stack down the left edge in seq order:
// the painted region is the locator, the pin is the index into the notes.
export function AnnotationOverlay({
  annotations,
}: {
  annotations: OverlayAnnotation[];
}) {
  const [visible, setVisible] = useState(true);
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  if (annotations.length === 0) return null;
  const open = annotations.find((a) => a.seq === openSeq) ?? null;
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
          {annotations.map((a, i) => (
            <AnnotationPin
              key={a.id}
              seq={a.seq}
              x={0.04}
              y={0.06 + i * 0.08}
              active={openSeq === a.seq}
              onClick={() => setOpenSeq(openSeq === a.seq ? null : a.seq)}
            />
          ))}
          {open && (
            <AnnotationNotePopover
              mode="read"
              seq={open.seq}
              note={open.note}
              authorLine={open.authorLine}
              bounds={{ x: 0.08, y: 0.06 + (open.seq - 1) * 0.08, w: 0, h: 0 }}
            />
          )}
        </>
      )}
    </>
  );
}
