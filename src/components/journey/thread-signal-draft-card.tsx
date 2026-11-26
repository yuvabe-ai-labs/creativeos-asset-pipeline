"use client";

import { useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SignalDraftCard, SignalDraftDecision } from "@/lib/journey/thread/schema";

const MIN_POSTS = 1;

/** A signal the market agent drafted from fetched posts (D530 step 3). Kept as it is, edited
 *  first (name, tags, description, which posts), or dropped. Nothing is saved until Keep. */
export function ThreadSignalDraftCard({ id, card, busy, onDecide }: {
  id: string;
  card: SignalDraftCard;
  busy: boolean;
  onDecide: (decision: SignalDraftDecision) => void;
}) {
  const pending = card.status === "pending";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(card.name);
  const [tags, setTags] = useState(card.tags.join(", "));
  const [description, setDescription] = useState(card.description);
  const [itemIds, setItemIds] = useState(card.itemIds);
  const thumbs = card.thumbs.filter((t) => itemIds.includes(t.itemId));

  const keep = () => onDecide(editing
    ? { decision: "keep", name: name.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean), description: description.trim(), itemIds }
    : { decision: "keep", name: card.name, tags: card.tags, description: card.description, itemIds: card.itemIds });

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <p className="text-eyebrow text-muted-foreground">Draft signal</p>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`} className="text-xs">Name</Label>
          <Input id={`${id}-name`} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor={`${id}-tags`} className="text-xs">Tags, separated by commas</Label>
          <Input id={`${id}-tags`} value={tags} disabled={busy} onChange={(e) => setTags(e.target.value)} />
          <Label htmlFor={`${id}-description`} className="text-xs">Description</Label>
          <Textarea id={`${id}-description`} value={description} disabled={busy} rows={3} onChange={(e) => setDescription(e.target.value)} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{card.name}</p>
          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">{card.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
          )}
          <p className="text-sm text-muted-foreground">{card.description}</p>
        </div>
      )}
      <ul className="flex flex-wrap gap-2" aria-label="The posts behind it">
        {thumbs.map((t) => (
          <li key={t.itemId} className="relative flex w-16 flex-col gap-1">
            <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored thumbnail, already small */}
              {t.url ? <img src={t.url} alt="" className="size-full object-cover" /> : <ImageOff className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
            </div>
            <span className="truncate text-[11px] text-muted-foreground">@{t.handle}</span>
            {editing && itemIds.length > MIN_POSTS && (
              <Button
                size="icon-xs" variant="outline" className="absolute -right-1.5 -top-1.5 rounded-full bg-card"
                aria-label={`Remove @${t.handle}'s post`} disabled={busy}
                onClick={() => setItemIds((now) => now.filter((x) => x !== t.itemId))}
              >
                <X strokeWidth={1.5} aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || (editing && !name.trim())} onClick={keep}>
            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden />}
            Keep
          </Button>
          {!editing && <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide({ decision: "drop" })}>Drop</Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{card.status === "kept" ? "Kept as a signal. It is on the Signals tab." : "Dropped."}</p>
      )}
    </div>
  );
}
