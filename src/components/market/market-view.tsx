"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMarket } from "@/hooks/use-market";
import type { MoodboardItem } from "@/lib/db/moodboards";
import type { MarketBucket } from "@/lib/market/constants";
import { AddReferenceTile } from "./add-reference-tile";
import { AddReferenceDialog } from "./add-reference-dialog";
import { ReferenceTile } from "./reference-tile";
import { ReferenceLightbox } from "./reference-lightbox";
import { GroupAsSignalDialog } from "./group-as-signal-dialog";
import { SignalCard } from "./signal-card";
import { SignalDetail } from "./signal-detail";

type MarketTab = MarketBucket | "signals";

// CSS-columns masonry: children keep intrinsic height and flow into balanced columns,
// so tiles stagger naturally AND non-image children (the dashed add tile) can sit in
// the same grid — which a photo-album masonry, needing measured dimensions, cannot do.
const MASONRY = "columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid";

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
  const [addBucket, setAddBucket] = useState<MarketBucket | null>(null);
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
          <TabsTrigger value="direct">
            Direct{market.data?.direct.items.length ? ` (${market.data.direct.items.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="adjacent">
            Adjacent
            {market.data?.adjacent.items.length ? ` (${market.data.adjacent.items.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="signals">
            Signals{market.data?.signals.length ? ` (${market.data.signals.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {(["direct", "adjacent"] as const).map((bucket) => (
          <TabsContent key={bucket} value={bucket} className="flex flex-col gap-3 pt-4">
            <p className="text-sm text-muted-foreground">
              {bucket === "direct"
                ? "What competitors and the category are doing."
                : "Interesting creative outside the category, worth learning from."}
            </p>
            {market.loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className={MASONRY}>
                <AddReferenceTile
                  label={`Add ${bucket === "direct" ? "Direct" : "Adjacent"} reference`}
                  onClick={() => setAddBucket(bucket)}
                />
                {market.data?.[bucket].items.map((it) => (
                  <ReferenceTile
                    key={it.id}
                    item={it}
                    selected={selectedIds.has(it.id)}
                    selectable
                    onToggle={() => toggle(it.id)}
                    onOpen={() => setPreviewItem(it)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}

        <TabsContent value="signals" className="pt-4">
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

      <AddReferenceDialog
        open={addBucket !== null}
        bucket={addBucket ?? "direct"}
        onClose={() => setAddBucket(null)}
        onAdd={market.addReference}
      />

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
