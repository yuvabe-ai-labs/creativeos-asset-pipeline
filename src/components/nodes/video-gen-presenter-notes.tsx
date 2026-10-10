"use client";

import { UserRound } from "lucide-react";

// D299 — what the shot's presenter means on the chosen model, under the model picker.
export function VideoGenPresenterNotes({ name, notes }: { name: string; notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="-mt-6 flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <UserRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
        <span className="font-medium text-foreground">Avatar: {name || "Unnamed"}</span>
        {notes.map((n) => <p key={n}>{n}</p>)}
      </div>
    </div>
  );
}
