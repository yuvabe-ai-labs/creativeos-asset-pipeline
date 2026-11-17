"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/kb/utils";
import { SCRIPT_IMAGE_EXTENSIONS, SCRIPT_IMAGE_MAX_BYTES, SCRIPT_IMAGE_MAX_LABEL } from "@/lib/scripts/constants";

const ACCEPT = [...SCRIPT_IMAGE_EXTENSIONS].map((e) => `.${e}`).join(",");
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
/** The box both picker tabs share, so switching tabs never resizes the dialog. */
export const PICKER_BOX = "h-72";

/** D446 — the picker's Upload tab, styled after the Script node's dropzone: a dashed drop area,
 *  then a preview of what was chosen with its name, size and the ways to change it. */
export function ScriptImageUploadPane({ files, max, onFilesChange }: {
  files: File[];
  /** How many it may hold (1 for a location: a new pick replaces the old). */
  max: number;
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
  const pick = () => inputRef.current?.click();

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files ?? [])); }}
    >
      {files.length === 0 ? (
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
          <span className="font-display text-lg font-medium">{max > 1 ? "Upload pictures" : "Upload a picture"}</span>
          <span className="text-sm font-normal text-muted-foreground">Drop a .jpg, .png or .webp here, or click to browse</span>
        </Button>
      ) : (
        <>
          <div
            className={cn(
              PICKER_BOX,
              "overflow-hidden rounded-2xl border bg-muted/40",
              over && "border-primary",
              files.length > 1 && "grid auto-rows-[minmax(0,1fr)] grid-cols-3 gap-1 p-1",
            )}
          >
            {previews.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={files[i].name} className={cn("size-full object-cover", files.length > 1 && "rounded-lg")} />
            ))}
          </div>
          <ul className="flex flex-col gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}:${f.size}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size)} · {extOf(f.name).toUpperCase()}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => onFilesChange(files.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            {(max === 1 || files.length < max) && (
              <Button variant="outline" size="sm" onClick={pick}>
                <ImagePlus className="size-4" strokeWidth={1.5} />
                {max === 1 ? "Replace" : "Add a picture"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setError(""); onFilesChange([]); }}>
              <X className="size-4" strokeWidth={1.5} />
              Clear
            </Button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">A clean shot on a plain background works best.</p>
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
