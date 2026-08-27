"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketBucket } from "@/lib/market/constants";

type Props = {
  defaultBucket: MarketBucket;
  onAdd: (input: { url: string; bucket: MarketBucket; note?: string }) => Promise<boolean>;
};

export function AddReferenceForm({ defaultBucket, onAdd }: Props) {
  const [url, setUrl] = useState("");
  const [bucket, setBucket] = useState<MarketBucket>(defaultBucket);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd({ url: url.trim(), bucket, note: note.trim() || undefined });
    setBusy(false);
    if (ok) {
      setUrl("");
      setNote("");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/40 p-3 hover:bg-primary/5">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Paste a link — reel, video, image, article…"
          className="flex-1"
        />
        <Select value={bucket} onValueChange={(v) => setBucket(v as MarketBucket)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="adjacent">Adjacent</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => void submit()} disabled={!url.trim() || busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Plus className="size-4" strokeWidth={1.5} />
          )}
          Add
        </Button>
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note — what caught your eye?"
        rows={1}
        className="resize-none"
      />
    </div>
  );
}
