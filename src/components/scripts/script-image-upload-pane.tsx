"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Star, Trash2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SCRIPT_IMAGE_EXTENSIONS, SCRIPT_IMAGE_MAX_BYTES, SCRIPT_IMAGE_MAX_LABEL } from "@/lib/scripts/constants";

const ACCEPT = [...SCRIPT_IMAGE_EXTENSIONS].map((e) => `.${e}`).join(",");
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
/** The box both picker tabs share, so switching tabs never resizes the dialog. */
export const PICKER_BOX = "h-72";
/** One-picture mode (a location): the whole picture at its own shape, uncropped. The frame hugs
 *  the picture (no grey side bars) and is capped low enough that the dialog never scrolls. */
const SINGLE_FRAME = "w-fit max-w-full self-center overflow-hidden rounded-2xl border bg-muted/40";
const SINGLE_IMG = "block h-auto max-h-[40vh] w-auto max-w-full object-contain";
/** The multi-picture grid: a fixed 3 × 2 of slots inside PICKER_BOX. */
const GRID_SLOTS = 6;

/** D446 — the picker's Upload tab, styled after the Script node's dropzone.
 *  One picture (a location): a dashed drop area, then the preview with Replace / Clear.
 *  Several (a product's angles): a fixed grid of slots. Pictures fill the slots in order, the
 *  "Add a picture" slot sits in the next free one, and each picture is removed from its own
 *  slot on hover. The grid never grows, so the dialog never outgrows the screen. */
export function ScriptImageUploadPane({ files, max, existing = [], onRemoveExisting, onMakeMainExisting, current, onFilesChange }: {
  files: File[];
  /** How many NEW pictures it may hold (1 for a location: a new pick replaces the old). */
  max: number;
  /** Pictures the item already has: they fill the first slots, so adding more continues after
   *  them (the first is the main picture). */
  existing?: string[];
  /** Remove one of `existing` from the item (shown on hover, like a new file's delete). */
  onRemoveExisting?: (index: number) => void;
  /** Make one of `existing` the item's main picture (the star, as on the product card). */
  onMakeMainExisting?: (index: number) => void;
  /** One-picture mode (a location): the picture it has now, shown until a new one is chosen —
   *  a new pick replaces it. */
  current?: string | null;
  onFilesChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (incoming: File[]) => {
    const ok = incoming.filter((f) => SCRIPT_IMAGE_EXTENSIONS.has(extOf(f.name)) && f.size <= SCRIPT_IMAGE_MAX_BYTES);
    setError(ok.length < incoming.length ? `Only .jpg, .png or .webp, up to ${SCRIPT_IMAGE_MAX_LABEL}.` : "");
    if (ok.length === 0) return;
    if (max === 1) return onFilesChange(ok.slice(0, 1));
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    onFilesChange([...files, ...ok.filter((f) => !seen.has(`${f.name}:${f.size}`))].slice(0, max));
  };
  // The slot grid for a product's pictures, even when only one more fits (5 of 6 already there).
  const grid = max > 1 || existing.length > 0;
  const pick = () => inputRef.current?.click();
  const remove = (i: number) => onFilesChange(files.filter((_, j) => j !== i));
  const clear = () => { setError(""); onFilesChange([]); };

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files ?? [])); }}
    >
      {grid ? (
        <SlotGrid
          pictures={[
            ...existing.map((url, i) => ({
              url,
              name: `Picture ${i + 1}`,
              onRemove: onRemoveExisting && (() => onRemoveExisting(i)),
              onMakeMain: onMakeMainExisting && (() => onMakeMainExisting(i)),
            })),
            ...previews.map((url, i) => ({
              url,
              name: files[i].name,
              onRemove: () => remove(i),
              // New files upload after the item's pictures, so one can only be made main (moved
              // first) when there are none yet.
              onMakeMain: existing.length === 0 ? () => onFilesChange([files[i], ...files.filter((_, j) => j !== i)]) : undefined,
            })),
          ]}
          slots={Math.min(existing.length + max, GRID_SLOTS)}
          over={over}
          onAdd={pick}
        />
      ) : files.length === 0 && current ? (
        <>
          <div className={cn(SINGLE_FRAME, over && "border-primary")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current} alt="The current picture" className={SINGLE_IMG} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={pick}>
              <ImagePlus className="size-4" strokeWidth={1.5} />
              Replace
            </Button>
            <span className="text-xs text-muted-foreground">Or drop a new picture here.</span>
          </div>
        </>
      ) : files.length === 0 ? (
        <Button
          variant="ghost"
          onClick={pick}
          className={cn(
            PICKER_BOX,
            "w-full flex-col gap-3 whitespace-normal rounded-2xl border border-dashed px-6 text-center transition-colors",
            over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UploadCloud className="size-6" strokeWidth={1.5} />
          </span>
          <span className="font-display text-lg font-medium">Upload a picture</span>
          <span className="text-sm font-normal text-muted-foreground">Drop a .jpg, .png or .webp here, or click to browse</span>
        </Button>
      ) : (
        <>
          <div className={cn(SINGLE_FRAME, over && "border-primary")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[0]} alt={files[0].name} className={SINGLE_IMG} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={pick}>
              <ImagePlus className="size-4" strokeWidth={1.5} />
              Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              <X className="size-4" strokeWidth={1.5} />
              Clear
            </Button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {grid ? `${existing.length + files.length} of ${existing.length + max} · ` : ""}A clean shot on a plain background works best.
        </p>
        {grid && files.length > 0 && (
          <Button variant="ghost" size="xs" onClick={clear}>
            <X className="size-3.5" strokeWidth={1.5} />
            Clear
          </Button>
        )}
      </div>
      <Input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
    </div>
  );
}

type Slot = { url: string; name: string; onRemove?: () => void; onMakeMain?: () => void };

/** The fixed slots: filled ones in order (the first is the main picture), then the add slot,
 *  then quiet empty ones. */
function SlotGrid({ pictures, slots, over, onAdd }: {
  pictures: Slot[];
  slots: number;
  over: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        PICKER_BOX,
        "grid grid-cols-3 grid-rows-2 gap-2 rounded-2xl border bg-muted/30 p-2 transition-colors",
        over && "border-primary bg-primary/5",
      )}
    >
      {Array.from({ length: slots }, (_, i) => {
        if (i < pictures.length) {
          const p = pictures[i];
          return (
            <div key={p.url} className="group relative min-h-0 overflow-hidden rounded-lg border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="size-full object-cover" />
              {i === 0 && (
                <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[0.7rem] font-medium text-background">
                  Main
                </span>
              )}
              {/* Shown on hover (or keyboard focus), as on the product card: the star makes it
                  the main picture, the bin removes it. */}
              <span className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {i > 0 && p.onMakeMain && (
                  <Button
                    // Same look as the product card's star (secondary, its own hover).
                    variant="secondary"
                    size="icon-xs"
                    aria-label={`Make ${p.name} the main picture`}
                    onClick={p.onMakeMain}
                  >
                    <Star className="size-3.5" strokeWidth={1.5} />
                  </Button>
                )}
                {p.onRemove && (
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Remove ${p.name}`}
                    onClick={p.onRemove}
                    className="bg-background/90 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.5} />
                  </Button>
                )}
              </span>
            </div>
          );
        }
        if (i === pictures.length) {
          return (
            <Button
              key="add"
              variant="ghost"
              onClick={onAdd}
              className="h-full min-h-0 flex-col gap-1.5 whitespace-normal rounded-lg border border-dashed border-primary/40 px-2 text-center text-primary hover:bg-primary/5 hover:text-primary"
            >
              <ImagePlus className="size-5" strokeWidth={1.5} />
              <span className="text-sm font-medium">{pictures.length === 0 ? "Add pictures" : "Add a picture"}</span>
              {pictures.length === 0 && (
                <span className="text-xs font-normal text-muted-foreground">Drop or click to browse</span>
              )}
            </Button>
          );
        }
        return <div key={`empty-${i}`} aria-hidden className="rounded-lg border border-dashed border-border/70" />;
      })}
    </div>
  );
}
