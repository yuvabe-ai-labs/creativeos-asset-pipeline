"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AVATAR_IMAGE_ACCEPT, AVATAR_IMAGE_MAX_LABEL } from "@/lib/avatars/constants";
import type { AvatarImage } from "@/lib/avatars/schema";

type Props = {
  /** "Add a front image" — also the accessible name of the empty control. */
  label: string;
  hint: string;
  /** CSS aspect-ratio of the box. Empty, loading and filled states all use it, so nothing
   *  moves between the placeholder and the finished image. */
  aspect: string;
  image: AvatarImage | null;
  uploading: boolean;
  onFile: (file: File) => void;
};

// One image slot of the Studio: a dashed primary "add" area, a same-size loading placeholder,
// then the image with a Replace action. Click, or drop a file on it.
export function AvatarImageDropzone({ label, hint, aspect, image, uploading, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => inputRef.current?.click();

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-xl", over && "ring-3 ring-ring/50")}
      style={{ aspectRatio: aspect }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      {uploading ? (
        <Skeleton className="size-full rounded-xl" />
      ) : image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={label} className="size-full rounded-xl border object-cover" />
          <Button variant="outline" size="sm" className="absolute bottom-2 right-2 bg-card" onClick={pick}>
            Replace
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          aria-label={label}
          onClick={pick}
          className="size-full flex-col gap-1.5 whitespace-normal rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
        >
          <ImagePlus className="size-5" strokeWidth={1.5} />
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">{hint}</span>
          <span className="text-xs font-normal text-muted-foreground">
            png, jpg or webp · up to {AVATAR_IMAGE_MAX_LABEL}
          </span>
        </Button>
      )}

      <Input
        ref={inputRef}
        type="file"
        accept={AVATAR_IMAGE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
