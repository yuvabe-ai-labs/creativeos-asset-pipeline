"use client";

import { useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrandKit } from "@/hooks/use-brand-kit";
import { useImportedAssets } from "@/hooks/queries/asset-imports";
import { SCRIPT_IMAGE_EXTENSIONS } from "@/lib/scripts/constants";
import type { ScriptImage } from "@/lib/scripts/schema";

type LibraryImage = { url: string; preview: string; name: string; source: ScriptImage["source"] };

const ACCEPT = [...SCRIPT_IMAGE_EXTENSIONS].map((e) => `.${e}`).join(",");
const KB_FILTERS = { source: null, media: "image" } as const;

/** D446 — pick a product's pictures or a location's: upload new files, or choose from the client's
 *  brand kit and KB images. `max` is how many it may still take (1 for a location). */
export function ScriptImagePicker({ clientId, open, onOpenChange, title, max, onUpload, onPick }: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  max: number;
  onUpload: (files: File[]) => void;
  onPick: (images: ScriptImage[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<LibraryImage[]>([]);
  const kit = useBrandKit(open ? clientId : "");
  const kb = useImportedAssets(open ? clientId : "", KB_FILTERS);

  const library: LibraryImage[] = [
    ...kit.assets
      .filter((a) => a.category === "product" || a.category === "background")
      .map((a) => ({ url: a.storageUrl, preview: a.storageUrl, name: a.name, source: "brand-kit" as const })),
    ...(kb.data?.pages ?? []).flatMap((p) => p.items).map((r) => ({
      url: r.storage_url, preview: r.thumbnail_url ?? r.storage_url, name: r.filename, source: "kb" as const,
    })),
  ];

  const reset = () => { setFiles([]); setPicked([]); };
  const close = (next: boolean) => { if (!next) reset(); onOpenChange(next); };
  const toggle = (img: LibraryImage) =>
    setPicked((list) => list.some((p) => p.url === img.url)
      ? list.filter((p) => p.url !== img.url)
      : list.length < max ? [...list, img] : list);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {max > 1 ? `Add up to ${max}. The first one is the main picture.` : "One clear picture of the empty place."}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="upload">
          <TabsList>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="library">From the client</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="flex flex-col gap-2 pt-3">
            <Input
              type="file"
              accept={ACCEPT}
              multiple={max > 1}
              aria-label="Pictures to upload"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, max))}
            />
            <p className="text-xs text-muted-foreground">
              A clean shot on a plain background works best.
            </p>
          </TabsContent>
          <TabsContent value="library" className="pt-3">
            {library.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {kit.loading || kb.isLoading ? "Loading the client's pictures…" : "This client has no pictures yet. Upload one instead."}
              </p>
            ) : (
              <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                {library.map((img) => {
                  const on = picked.some((p) => p.url === img.url);
                  return (
                    <Button
                      key={img.url}
                      variant="ghost"
                      aria-pressed={on}
                      aria-label={img.name}
                      onClick={() => toggle(img)}
                      className={cn("relative h-auto overflow-hidden rounded-lg border border-border p-0", on && "ring-2 ring-primary")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt="" className="aspect-square w-full object-cover" />
                      {on && <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" strokeWidth={1.5} />}
                    </Button>
                  );
                })}
              </div>
            )}
            {kb.hasNextPage && (
              <Button variant="link" size="xs" className="mt-2 h-auto px-0" onClick={() => void kb.fetchNextPage()}>
                Show more
              </Button>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button
            disabled={files.length === 0 && picked.length === 0}
            onClick={() => {
              if (files.length > 0) onUpload(files);
              if (picked.length > 0) onPick(picked.map(({ url, source }) => ({ url, source })));
              close(false);
            }}
          >
            <ImagePlus className="size-4" strokeWidth={1.5} />
            Add {files.length + picked.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
