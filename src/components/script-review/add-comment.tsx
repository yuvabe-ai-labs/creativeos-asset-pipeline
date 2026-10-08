// src/components/script-review/add-comment.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partKey, partLabel, partOrder } from "@/lib/script-review/parts";
import { useReviewSurface } from "./review-surface-context";
import { PartComposer } from "./part-composer";

/** The Comments column's "Add a comment": the same whole-part comment, choosing the part from a list. */
export function AddComment() {
  const { doc, commentable, onPost } = useReviewSurface();
  const parts = [...commentable.values()].sort((a, b) => partOrder(a, doc) - partOrder(b, doc));
  const items = parts.map((p) => ({ value: partKey(p), label: partLabel(p, doc) ?? "" }));
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(items[0]?.value ?? "");
  if (!onPost || parts.length === 0) return null;
  const part = commentable.get(selected) ?? parts[0];

  if (!open) {
    return (
      <Button
        variant="outline"
        className="self-start border-dashed border-primary/40 text-primary hover:bg-primary/5"
        onClick={() => setOpen(true)}
      >
        <Plus strokeWidth={1.5} />
        Add a comment
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {/* `items` makes SelectValue show the part's name, not its key (Base UI Select). */}
      <Select items={items} value={selected} onValueChange={(v) => v && setSelected(v)}>
        <SelectTrigger className="w-full" aria-label="Which part">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PartComposer
        placeholder="Your comment"
        submitLabel="Post"
        onSubmit={async (body) => {
          await onPost(part, body);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
