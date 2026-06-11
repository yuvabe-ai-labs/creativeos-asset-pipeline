"use client";

import { type ChangeEvent, type DragEvent, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { SliceToggles } from "./slice-toggles";

type ScriptEmptyStateProps = {
  title: string;
  slices: KBSliceKey[];
  onTitleChange: (title: string) => void;
  onToggleSlice: (key: KBSliceKey) => void;
  onUpload: (source: string) => void; // sets source + fires extraction
};

// The focus view's EMPTY state. Upload-first: a dropzone is the main action
// (uploading fires extraction). Title + brand-context are supporting controls.
export function ScriptEmptyState({
  title,
  slices,
  onTitleChange,
  onToggleSlice,
  onUpload,
}: ScriptEmptyStateProps) {
  const [dragOver, setDragOver] = useState(false);

  function readFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (text.trim()) onUpload(text);
    };
    reader.readAsText(file);
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    readFile(e.target.files?.[0]);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    readFile(e.dataTransfer.files?.[0]);
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
        <span className="font-display text-lg font-medium">Upload the reel brief</span>
        <span className="text-sm text-muted-foreground">
          Drop a .md or .txt here, or click to browse
        </span>
        <input
          type="file"
          accept=".md,.txt,text/plain,text/markdown"
          className="hidden"
          onChange={handleInput}
        />
      </label>

      <div className="grid gap-2">
        <Label htmlFor="empty-title">Title</Label>
        <Input
          id="empty-title"
          value={title}
          placeholder="Untitled script"
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label>Brand context</Label>
        <SliceToggles
          selected={slices}
          onToggle={onToggleSlice}
          allowedKeys={["compliance", "tone_of_voice", "personality", "brand_profile"]}
        />
        <p className="text-xs text-muted-foreground">
          Injected into extraction — adjust before uploading.
        </p>
      </div>
    </div>
  );
}
