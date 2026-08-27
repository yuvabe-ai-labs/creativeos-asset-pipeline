"use client";

import { useState } from "react";
import { Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { classifyUrl, youtubeVideoId } from "@/lib/market/classify";
import type { MarketBucket } from "@/lib/market/constants";
import { KindBadge } from "./kind-badge";

const BUCKET_LABEL: Record<MarketBucket, string> = {
  direct: "Direct",
  adjacent: "Adjacent",
};

type Props = {
  open: boolean;
  /** Comes from the active tab — the tab IS the bucket, so there is no second picker. */
  bucket: MarketBucket;
  onClose: () => void;
  onAdd: (input: { url: string; bucket: MarketBucket; note?: string }) => Promise<boolean>;
};

export function AddReferenceDialog({ open, bucket, onClose, onAdd }: Props) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = url.trim();
  const kind = trimmed ? classifyUrl(trimmed) : null;
  // YouTube thumbnails are derivable from the URL alone, so the preview is live as
  // you type. Other providers resolve server-side on save (oEmbed).
  const ytId = trimmed ? youtubeVideoId(trimmed) : null;
  const previewSrc =
    ytId
      ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
      : kind === "image" || kind === "gif"
        ? trimmed
        : null;

  async function save() {
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onAdd({ url: trimmed, bucket, note: note.trim() || undefined });
    setBusy(false);
    if (ok) {
      setUrl("");
      setNote("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add {BUCKET_LABEL[bucket]} reference</DialogTitle>
          <DialogDescription>
            Any link works — a reel, a video, an image or a page. If no preview can be
            fetched it still saves, with your note.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-black/10">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 p-4 text-center text-xs text-muted-foreground">
                <Link2 className="size-5" strokeWidth={1.5} />
                {trimmed ? "Preview resolves on save" : "Paste a link to preview"}
              </span>
            )}
            {kind && <KindBadge kind={kind} />}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ref-url">URL</Label>
              <Input
                id="ref-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                }}
                placeholder="https://instagram.com/reel/…"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ref-note">Note (optional)</Label>
              <Textarea
                id="ref-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="What caught your eye?"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!trimmed || busy}>
            {busy && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
            Add to {BUCKET_LABEL[bucket]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
