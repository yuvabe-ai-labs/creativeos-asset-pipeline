"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FileEmptyStateProps = {
  title: string;
  onTitleChange: (title: string) => void;
  onUpload: (file: File) => void;
};

const ACCEPTED = ".txt,.png,.jpg,.jpeg,.webp";
const ACCEPTED_MIME = new Set([
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function FileEmptyState({ title, onTitleChange, onUpload }: FileEmptyStateProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    // Client-side MIME guard — real validation happens on the server.
    if (!ACCEPTED_MIME.has(file.type) && !file.name.match(/\.(txt|png|jpe?g|webp)$/i)) {
      return;
    }
    onUpload(file);
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    submit(e.target.files?.[0]);
    // reset so the same file can be re-selected after an error
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    submit(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="grid gap-8">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "nodrag flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="size-6" />
        </span>
        <span className="font-display text-lg font-medium">Attach a file</span>
        <span className="text-sm text-muted-foreground">
          Drop a file here, or click to browse
        </span>
        <span className="text-xs text-muted-foreground/60">
          Images: .png .jpg .webp up to 10 MB · Text: .txt up to 100 KB
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleInput}
        />
      </label>

      <div className="grid gap-2">
        <Label htmlFor="file-empty-title">Title</Label>
        <Input
          id="file-empty-title"
          value={title}
          placeholder="Untitled file"
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>
    </div>
  );
}
