"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = { onAdd: (url: string) => void };

export function GalleryAddUrl({ onAdd }: Props) {
  const [url, setUrl] = useState("");
  function submit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setUrl("");
  }
  return (
    <div className="mb-2 flex items-center gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder="Paste an image URL…"
        className="h-9 text-sm"
      />
      <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1" onClick={submit} disabled={!url.trim()}>
        <Plus className="size-3.5" strokeWidth={1.5} /> Add
      </Button>
    </div>
  );
}
