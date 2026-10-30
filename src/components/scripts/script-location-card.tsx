"use client";

import { useState } from "react";
import { ImagePlus, MapPin, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableField } from "@/components/nodes/editable-field";
import type { ScriptLocation } from "@/lib/scripts/schema";
import { useScriptAssets } from "./script-assets-context";
import { ScriptImagePicker } from "./script-image-picker";

/** D446, D448 — one of the script's locations: its name, its description and its plate. */
export function ScriptLocationCard({ location }: { location: ScriptLocation }) {
  const assets = useScriptAssets();
  const [picking, setPicking] = useState(false);
  const drawing = assets?.drawing.has(location.id) ?? false;
  const uploading = assets?.uploadingTo === location.id;
  const update = (patch: Partial<Pick<ScriptLocation, "name" | "description">>) =>
    assets?.op({ op: "update_location", locationId: location.id, name: location.name, description: location.description, ...patch });

  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-muted" aria-busy={drawing || undefined}>
        {location.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={location.image.url} alt={`${location.name}, the empty set`} className="size-full object-cover" />
        ) : (
          <MapPin className="absolute inset-0 m-auto size-6 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
        )}
        {drawing && <span aria-hidden className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 font-medium">
            {assets ? <EditableField value={location.name} singleLine onCommit={(name) => update({ name })} /> : location.name}
          </span>
          {assets && (
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${location.name}`} onClick={() => assets.op({ op: "remove_location", locationId: location.id })}>
              <Trash2 className="size-4" strokeWidth={1.5} />
            </Button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {assets ? (
            <EditableField value={location.description} multiline placeholder="Describe the place" onCommit={(description) => update({ description })} />
          ) : location.description}
        </span>
        {!location.image && <span className="text-xs text-muted-foreground">Needs a picture</span>}
        {assets && (
          <div className="mt-1 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={drawing} onClick={() => assets.generatePlate(location.id)}
              className="border border-dashed border-primary/40 text-primary hover:bg-primary/5">
              <Sparkles className="size-4" strokeWidth={1.5} />
              {drawing ? "Drawing…" : location.image ? "Draw again" : "Generate"}
            </Button>
            <Button variant="ghost" size="sm" disabled={uploading} onClick={() => setPicking(true)}>
              <ImagePlus className="size-4" strokeWidth={1.5} />
              {uploading ? "Adding…" : "Add a picture"}
            </Button>
            {location.image && (
              <Button variant="ghost" size="sm" onClick={() => assets.op({ op: "set_location_image", locationId: location.id, image: null })}>
                <X className="size-4" strokeWidth={1.5} />
                Clear
              </Button>
            )}
            <ScriptImagePicker
              clientId={assets.clientId}
              open={picking}
              onOpenChange={setPicking}
              title={`A picture of ${location.name}`}
              max={1}
              onUpload={(files) => void assets.upload(files.slice(0, 1), { kind: "location", locationId: location.id })}
              onPick={([image]) => image && assets.op({ op: "set_location_image", locationId: location.id, image })}
            />
          </div>
        )}
      </div>
    </li>
  );
}
