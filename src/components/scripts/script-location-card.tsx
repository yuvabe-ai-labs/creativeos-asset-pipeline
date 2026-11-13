"use client";

import { useState } from "react";
import { ImagePlus, MapPin, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableField } from "@/components/nodes/editable-field";
import type { ScriptLocation } from "@/lib/scripts/schema";
import { locationVersions } from "@/lib/scripts/assets";
import { useScriptAssets } from "./script-assets-context";
import { ScriptImagePicker } from "./script-image-picker";
import { LocationVersionSwitcher } from "./location-version-switcher";
import { cn } from "@/lib/utils";

/** D446, D448 — one of the script's locations: its name, its description and its plate. D465:
 *  `large` shows the plate big (the Visualise board's popup), and Redraw draws again straight from
 *  the description — the words are the brief, so there is nothing to ask first. D489: a past plate
 *  can be looked at and put back. */
export function ScriptLocationCard({ location, large = false }: { location: ScriptLocation; large?: boolean }) {
  const assets = useScriptAssets();
  const [picking, setPicking] = useState(false);
  const drawing = assets?.drawing.has(location.id) ?? false;
  const uploading = assets?.uploadingTo === location.id;
  const currentUrl = location.image?.url ?? null;
  // D489 — the past plate being looked at, if any, and the plate it was opened over. A new plate (a
  // draw, an upload, a restore) ends the look, so the card shows what the location now has; on a
  // restore the new plate IS the one looked at, so the picture never changes.
  const [preview, setPreview] = useState<{ url: string; over: string | null } | null>(null);
  const previewUrl = preview && preview.over === currentUrl ? preview.url : null;
  const shownUrl = previewUrl ?? currentUrl;
  const versions = locationVersions(location);
  // D489 — the large frame's shape (width / height), measured when the plate in use loads (or, with
  // none yet, the first shown). Past plates can differ slightly in size, so they fit inside this
  // frame rather than resizing it, and a restore keeps it: only a newly loaded plate in use moves it.
  const [ratio, setRatio] = useState<number | null>(null);
  const measure = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    if (shownUrl === currentUrl || ratio === null) setRatio(img.naturalWidth / img.naturalHeight);
  };
  const update = (patch: Partial<Pick<ScriptLocation, "name" | "description">>) =>
    assets?.op({ op: "update_location", locationId: location.id, name: location.name, description: location.description, ...patch });

  return (
    <li className={cn("flex gap-3 rounded-xl border border-border bg-card p-3", large && "w-fit flex-col gap-4 border-0 p-0")}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-lg bg-muted",
          large ? (shownUrl ? (ratio ? "h-[60vh] max-h-[40rem] max-w-[calc(100vw-4rem)]" : "w-fit") : "h-48 w-80 max-w-full") : "aspect-video w-32",
        )}
        style={large && shownUrl && ratio ? { aspectRatio: ratio } : undefined}
        aria-busy={drawing || undefined}
      >
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownUrl}
            alt={`${location.name}, the empty set`}
            onLoad={large ? (e) => measure(e.currentTarget) : undefined}
            className={
              large
                ? ratio
                  ? "block size-full object-contain"
                  : "block h-[60vh] max-h-[40rem] w-auto max-w-[calc(100vw-4rem)] object-contain"
                : "size-full object-cover"
            }
          />
        ) : (
          <MapPin className="absolute inset-0 m-auto size-6 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
        )}
        {drawing && <span aria-hidden className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />}
      </div>
      {/* Large: the plate sets the width; the words wrap to it rather than widening the popup. */}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", large && "w-0 min-w-full")}>
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
        {assets && versions.length > 1 && (
          <LocationVersionSwitcher
            versions={versions}
            shownUrl={shownUrl}
            currentUrl={currentUrl}
            onShow={(url) => setPreview(url === currentUrl ? null : { url, over: currentUrl })}
            // The preview is left alone: it ends by itself the moment the plate becomes this one
            // (it is tied to the plate it was opened over). Clearing it here showed the old plate
            // for a frame, while the op waits on cancelled reads before applying.
            onUse={({ url, source }) => assets.op({ op: "set_location_image", locationId: location.id, image: { url, source } })}
          />
        )}
        {assets && (
          <div className="mt-1 flex flex-wrap gap-2">
            {location.image ? (
              // D465 (amends D449 for plates) — Redraw draws again from the description, no question.
              <Button variant="outline" size="sm" disabled={drawing} onClick={() => assets.generatePlate(location.id)}>
                <RefreshCw className="size-3.5" strokeWidth={1.5} />
                {drawing ? "Drawing…" : "Redraw"}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled={drawing} onClick={() => assets.generatePlate(location.id)}
                className="border border-dashed border-primary/40 text-primary hover:bg-primary/5">
                <Sparkles className="size-4" strokeWidth={1.5} />
                {drawing ? "Drawing…" : "Generate"}
              </Button>
            )}
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
