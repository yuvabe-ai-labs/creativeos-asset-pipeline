"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { ArrowUp, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ACCEPTED = ".png,.jpg,.jpeg,.webp";
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

type Props = {
  imageUrl: string | null;
  onSelect: (file: File) => void;
  onClear: () => void;
};

// Step 2: the character's reference image. A dashed drop zone until one is chosen, then the
// image itself with Replace / Remove.
export function AvatarUploadStep({ imageUrl, onSelect, onClear }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (file && ACCEPTED_MIME.has(file.type)) onSelect(file);
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    submit(e.target.files?.[0]);
    // reset so the same file can be re-selected
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    submit(e.dataTransfer.files?.[0]);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">2. Upload character</h2>
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleInput} />

      {imageUrl ? (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img src={imageUrl} alt="Character" className="size-24 rounded-lg object-cover" />
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Character image</span>
            <span className="text-xs text-muted-foreground">Used for the preview and every view.</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()}>
              <Upload className="size-3.5" strokeWidth={1.5} />
              Replace
            </Button>
            <Button variant="ghost" size="icon" aria-label="Remove image" onClick={onClear}>
              <X className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/[0.03] hover:border-primary/70 hover:bg-primary/5",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ArrowUp className="size-6" strokeWidth={1.5} />
          </span>
          <span className="text-sm font-medium">Drop a character image here</span>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={(e) => {
              // The label already opens the picker; stop the click reaching it a second time.
              e.preventDefault();
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <Upload className="size-3.5" strokeWidth={1.5} />
            Upload image
          </Button>
          <span className="text-xs text-muted-foreground">.png .jpg .webp · a clear, front-facing portrait works best</span>
        </label>
      )}
    </section>
  );
}
