"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import type { MoodboardItem } from "@/lib/db/moodboards";

type Props = {
  open: boolean;
  selectedItems: MoodboardItem[];
  onClose: () => void;
  onCreate: (input: {
    name: string;
    tags: string[];
    description: string;
    itemIds: string[];
  }) => Promise<boolean>;
};

export function GroupAsSignalDialog({ open, selectedItems, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const ok = await onCreate({
      name: name.trim(),
      tags,
      description: description.trim(),
      itemIds: selectedItems.map((i) => i.id),
    });
    setBusy(false);
    if (ok) {
      setName("");
      setTagsInput("");
      setDescription("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Group as Signal</DialogTitle>
          <DialogDescription>
            Name the pattern these {selectedItems.length} references share. The references stay in
            their buckets — the signal links to them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signal-name">Name</Label>
            <Input
              id="signal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tactile product opening"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signal-tags">Tags (comma-separated)</Label>
            <Input
              id="signal-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Hook, Product demo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signal-description">Description</Label>
            <Textarea
              id="signal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="These examples open with pouring, touching or applying the product…"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {selectedItems.map((it) => {
              const visual =
                it.thumbnail_url ??
                (it.kind === "image" || it.kind === "gif" ? it.image_url : null);
              return visual ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={it.id} src={visual} alt="" className="size-10 rounded object-cover" />
              ) : (
                <span
                  key={it.id}
                  className="flex size-10 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground"
                >
                  link
                </span>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim() || busy}>
            {busy && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
            Save Signal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
