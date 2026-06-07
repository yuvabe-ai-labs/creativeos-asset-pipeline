"use client";

import { type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { SliceToggles } from "./slice-toggles";

type ScriptEmptyStateProps = {
  title: string;
  source: string;
  slices: KBSliceKey[];
  onTitleChange: (title: string) => void;
  onSourceChange: (source: string) => void;
  onToggleSlice: (key: KBSliceKey) => void;
  onSubmit: (source: string) => void; // fires extraction
};

// The focus view's EMPTY state: title, brand-context toggles, and upload/paste.
// Uploading auto-fires extraction; pasting fires it on blur.
export function ScriptEmptyState({
  title,
  source,
  slices,
  onTitleChange,
  onSourceChange,
  onToggleSlice,
  onSubmit,
}: ScriptEmptyStateProps) {
  function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      onSourceChange(text);
      if (text.trim()) onSubmit(text); // auto-parse on upload
    };
    reader.readAsText(file);
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-6 py-10">
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
        <SliceToggles selected={slices} onToggle={onToggleSlice} />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="empty-source">Reel script</Label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Upload className="size-3.5" /> Upload .md/.txt
            <input
              type="file"
              accept=".md,.txt,text/plain,text/markdown"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        </div>
        <Textarea
          id="empty-source"
          value={source}
          rows={14}
          placeholder="Paste the reel script here, then click away to extract…"
          onChange={(e) => onSourceChange(e.target.value)}
          onBlur={() => {
            if (source.trim()) onSubmit(source); // auto-parse on blur
          }}
        />
        <p className="text-xs text-muted-foreground">
          Uploading or pasting a script starts extraction automatically.
        </p>
      </div>
    </div>
  );
}
