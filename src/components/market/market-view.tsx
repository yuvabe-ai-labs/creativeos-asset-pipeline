"use client";

import { useMemo, useState } from "react";
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useImageDimensions } from "@/hooks/use-image-dimensions";
import { useMarket } from "@/hooks/use-market";
import type { MoodboardItem } from "@/lib/db/moodboards";
import type { MarketBucket } from "@/lib/market/constants";
import { AddReferenceForm } from "./add-reference-form";
import { ReferenceTile } from "./reference-tile";
import { ReferenceLightbox } from "./reference-lightbox";
import { GroupAsSignalDialog } from "./group-as-signal-dialog";
import { SignalCard } from "./signal-card";
import { SignalDetail } from "./signal-detail";

type MarketTab = MarketBucket | "signals";

type AlbumPhoto = {
  key: string;
  src: string;
  width: number;
  height: number;
  item: MoodboardItem;
};

function ReferenceMasonry({
  items,
  selectedIds,
  onToggle,
  onOpen,
}: {
  items: MoodboardItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (item: MoodboardItem) => void;
}) {
  const urls = useMemo(
    () => items.map((it) => it.thumbnail_url ?? it.image_url),
    [items],
  );
  const dimensions = useImageDimensions(urls);

  const photos: AlbumPhoto[] = useMemo(
    () =>
      items.map((it) => {
        const src = it.thumbnail_url ?? it.image_url;
        const dim = dimensions.get(src) ?? { width: 400, height: 400 };
        return { key: it.id, src, width: dim.width, height: dim.height, item: it };
      }),
    [items, dimensions],
  );

  return (
    <MasonryPhotoAlbum
      photos={photos}
      columns={(width) => (width < 640 ? 2 : width < 1024 ? 3 : 4)}
      spacing={8}
      render={{
        photo: (_, { photo, width, height }) => {
          const p = photo as AlbumPhoto;
          return (
            <ReferenceTile
              key={p.key}
              item={p.item}
              selected={selectedIds.has(p.item.id)}
              selectable
              width={width}
              height={height}
              onToggle={() => onToggle(p.item.id)}
              onOpen={() => onOpen(p.item)}
            />
          );
        },
      }}
    />
  );
}

export function MarketView({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
  clientSlug: string;
}) {
  const market = useMarket(clientId);
  const [tab, setTab] = useState<MarketTab>("direct");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<MoodboardItem | null>(null);
  const [signalDialogOpen, setSignalDialogOpen] = useState(false);
  const [openSignalId, setOpenSignalId] = useState<string | null>(null);

  const allItems = useMemo(
    () => [...(market.data?.direct.items ?? []), ...(market.data?.adjacent.items ?? [])],
    [market.data],
  );
  const selectedItems = useMemo(
    () => allItems.filter((it) => selectedIds.has(it.id)),
    [allItems, selectedIds],
  );
  const openSignal = market.data?.signals.find((s) => s.id === openSignalId) ?? null;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-eyebrow">Market</p>
        <h1 className="font-display text-2xl text-foreground">{clientName}</h1>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as MarketTab)}>
        <TabsList>
          <TabsTrigger value="direct">Direct</TabsTrigger>
          <TabsTrigger value="adjacent">Adjacent</TabsTrigger>
          <TabsTrigger value="signals">
            Signals{market.data?.signals.length ? ` (${market.data.signals.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {(["direct", "adjacent"] as const).map((bucket) => (
          <TabsContent key={bucket} value={bucket} className="flex flex-col gap-4 pt-3">
            <AddReferenceForm defaultBucket={bucket} onAdd={market.addReference} />
            {market.loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (market.data?.[bucket].items.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {bucket === "direct"
                  ? "No direct references yet — paste a link above or clip one from the browser."
                  : "No adjacent references yet — interesting creative outside the category lands here."}
              </p>
            ) : (
              <ReferenceMasonry
                items={market.data![bucket].items}
                selectedIds={selectedIds}
                onToggle={toggle}
                onOpen={setPreviewItem}
              />
            )}
          </TabsContent>
        ))}

        <TabsContent value="signals" className="pt-3">
          {openSignal ? (
            <SignalDetail
              signal={openSignal}
              onBack={() => setOpenSignalId(null)}
              onOpenItem={setPreviewItem}
              onDelete={async () => {
                await market.deleteSignal(openSignal.id);
                setOpenSignalId(null);
              }}
            />
          ) : (market.data?.signals.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No signals yet — select related references in Direct or Adjacent and group them.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {market.data!.signals.map((s) => (
                <SignalCard key={s.id} signal={s} onOpen={() => setOpenSignalId(s.id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-background px-4 py-2 shadow-lg ring-1 ring-black/10">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
          <Button size="sm" onClick={() => setSignalDialogOpen(true)}>
            Group as Signal
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
          >
            <X className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}

      {previewItem && <ReferenceLightbox item={previewItem} onClose={() => setPreviewItem(null)} />}

      <GroupAsSignalDialog
        open={signalDialogOpen}
        selectedItems={selectedItems}
        onClose={() => setSignalDialogOpen(false)}
        onCreate={async (input) => {
          const ok = await market.createSignal(input);
          if (ok) {
            setSignalDialogOpen(false);
            setSelectedIds(new Set());
            setTab("signals");
          }
          return ok;
        }}
      />
    </div>
  );
}
