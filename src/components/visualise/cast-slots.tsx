"use client";

import type { ReactNode } from "react";
import type { Avatar, AvatarViewId } from "@/lib/avatars/schema";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { CastSlot } from "./cast-slot";

// Spec §5 — one slot per person in the cast, the lead first as the script lists them.
export function CastSlots({ clientId, scriptId, doc, avatars, castMarker, viewMarker }: {
  clientId: string;
  scriptId: string;
  doc: ScriptDoc;
  avatars: ReadonlyMap<string, Avatar>;
  /** Spec 4 merge point: the comment marker on a person, and on each of their views. */
  castMarker?: (castId: string) => ReactNode;
  viewMarker?: (castId: string, view: AvatarViewId) => ReactNode;
}) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <div className="grid gap-4">
        {doc.cast.map((member) => (
          <CastSlot
            key={member.id}
            clientId={clientId}
            scriptId={scriptId}
            member={member}
            avatar={member.avatarId ? avatars.get(member.avatarId) ?? null : null}
            takenIds={doc.cast.filter((c) => c.id !== member.id && c.avatarId).map((c) => c.avatarId!)}
            headerExtra={castMarker?.(member.id)}
            marker={viewMarker ? (view) => viewMarker(member.id, view) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
