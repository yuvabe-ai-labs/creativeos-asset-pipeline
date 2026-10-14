"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PERSON_TYPE_LABELS } from "@/lib/avatars/constants";
import type { Avatar, PersonType } from "@/lib/avatars/schema";
import { AvatarTile } from "./avatar-tile";

type Filter = "all" | PersonType;

// D287 — the client's avatar library: an 8-across grid led by a dashed "New" tile.
export function AvatarsLibrary({
  clientName, clientSlug, avatars,
}: { clientName: string; clientSlug: string; avatars: Avatar[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const newHref = `/clients/${clientSlug}/avatars/new`;
  const shown = filter === "all" ? avatars : avatars.filter((a) => a.personType === filter);

  return (
    <section className="animate-rise mt-4">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow text-muted-foreground">{clientName}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">Avatars</h1>
        </div>
        <Button nativeButton={false} render={<Link href={newHref} />}>
          <Plus className="size-4" strokeWidth={1.5} />
          New avatar
        </Button>
      </header>

      {avatars.length === 0 ? (
        <EmptyState
          title="No avatars yet"
          body="An avatar is a reusable character for this client: a front image, a profile sheet and a voice, made once and used across videos."
          action={
            <Button nativeButton={false} render={<Link href={newHref} />}>
              + New avatar
            </Button>
          }
        />
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="generic">{PERSON_TYPE_LABELS.generic}</TabsTrigger>
              <TabsTrigger value="specific">{PERSON_TYPE_LABELS.specific}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={newHref} />}
              className="aspect-square h-auto flex-col gap-1 rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="size-5" strokeWidth={1.5} />
              <span className="text-xs font-semibold">New</span>
            </Button>
            {shown.map((avatar) => (
              <AvatarTile key={avatar.id} avatar={avatar} clientSlug={clientSlug} />
            ))}
          </div>

          {shown.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">No avatars of this type yet.</p>
          )}
        </>
      )}
    </section>
  );
}
