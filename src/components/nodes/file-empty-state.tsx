"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type FileEmptyStateProps = {
  onUpload: (file: File) => void;
  onPickFromDrive?: () => void;
};

const ACCEPTED = ".txt,.png,.jpg,.jpeg,.webp,.pdf,.docx";
const ACCEPTED_MIME = new Set([
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function FileEmptyState({ onUpload, onPickFromDrive }: FileEmptyStateProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    // Client-side MIME guard — real validation happens on the server.
    if (!ACCEPTED_MIME.has(file.type) && !file.name.match(/\.(txt|png|jpe?g|webp|pdf|docx)$/i)) {
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
          Images: .png .jpg .webp up to 10 MB · Text: .txt up to 100 KB · Docs: .pdf .docx up to 10 MB
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleInput}
        />
      </label>

      {onPickFromDrive && (
        <button
          type="button"
          onClick={onPickFromDrive}
          className="nodrag flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow active:scale-[0.99]"
        >
          <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
          Pick from Google Drive
        </button>
      )}
    </div>
  );
}
