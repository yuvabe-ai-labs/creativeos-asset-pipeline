"use client";

import { useState } from "react";
import { ArrowUpIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfiniteScrollSentinel } from "@/components/shared/infinite-scroll-sentinel";
import { IMPORT_SOURCES, IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { AssetImport } from "@/lib/asset-import/types";
import type { ClientBrandImageRow } from "@/lib/db/types";
import {
  isImportLive,
  useAssetImports,
  useImportedAssets,
  useRefreshImportedAssets,
  useRemoveImportedAsset,
  useStartAssetImport,
} from "@/hooks/queries/asset-imports";
import { BrandAssetsMasonry } from "./brand-assets-masonry";
import { BrandAssetsLightbox } from "./brand-assets-lightbox";
import { DeleteAssetDialog } from "./delete-asset-dialog";
import { SourceTabHeader } from "./source-tab-header";
import { RefreshConfirmDialog, type RefreshPlan } from "./refresh-confirm-dialog";

type SourceTab = "all" | ImportSource;
type Media = "all" | "image" | "video";

/** Loading placeholder heights — a masonry-like rhythm rather than a uniform grid. */
const SKELETON_HEIGHTS = [220, 300, 180, 260, 320, 200, 240, 280, 190, 310];

/**
 * The Brand assets page body (D302). One tab per source, always shown, so each source's state
 * lives with its assets: where it imports from (editable), how the last import went, Refresh —
 * or, when it has nothing to show, how to connect it or why it failed. "All" is the whole
 * library. The grid is a paged masonry; a tile opens the carousel.
 */
export function BrandAssetsLibrary({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<SourceTab>("all");
  const [media, setMedia] = useState<Media>("all");
  const [openIndex, setOpenIndex] = useState(-1);
  const [pendingDelete, setPendingDelete] = useState<ClientBrandImageRow | null>(null);
  const [refreshPlan, setRefreshPlan] = useState<RefreshPlan[] | null>(null);

  const status = useAssetImports(clientId);
  const filters = { source: tab === "all" ? null : tab, media: media === "all" ? null : media };
  const pages = useImportedAssets(clientId, filters);
  const refreshAssets = useRefreshImportedAssets(clientId);
  const remove = useRemoveImportedAsset(clientId);
  const start = useStartAssetImport(clientId);

  const imports = status.data?.imports ?? [];
  const counts = status.data?.counts;
  const targets = status.data?.targets;
  const lastImport = (s: ImportSource) => imports.find((i) => i.source === s);
  const anyLive = imports.some(isImportLive);
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];

  const tabCount = tab === "all" ? (counts?.total ?? 0) : (counts?.bySource[tab] ?? 0);
  const tabLive = tab === "all" ? anyLive : Boolean(lastImport(tab) && isImportLive(lastImport(tab)!));
  // A source tab with nothing in it shows its own panel (connect / failed) instead of a grid.
  const showGrid = tabCount > 0 || tabLive;
  const newSinceLoad =
    tab === "all" && media === "all" && anyLive && counts && pages.isSuccess && !pages.hasNextPage
      ? counts.total - items.length
      : 0;

  function askRefreshAll() {
    const plan = IMPORT_SOURCES.flatMap((s): RefreshPlan[] => {
      const target = targets?.[s];
      return target ? [{ source: s, target, lastSucceededAt: lastImport(s)?.lastSucceededAt ?? null }] : [];
    });
    if (plan.length === 0) toast.info("Connect a website, Instagram or Facebook first.");
    else setRefreshPlan(plan);
  }

  function confirmRefreshAll() {
    setRefreshPlan(null);
    start.mutate(undefined, { onError: (e) => toast.error(e.message) });
  }

  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };

  function confirmDelete(asset: ClientBrandImageRow) {
    setPendingDelete(null);
    // In the lightbox, stay where you were: the next asset slides into this place; deleting the
    // last one steps back, and deleting the only one closes it.
    if (openIndex >= 0) {
      const remaining = items.length - 1;
      setOpenIndex(remaining === 0 ? -1 : Math.min(openIndex, remaining - 1));
    }
    remove.mutate(asset.id, {
      onSuccess: () => toast.success("Deleted"),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Brand assets</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Images and videos imported from the brand&apos;s website and social accounts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={anyLive || start.isPending}
          onClick={askRefreshAll}
        >
          <RefreshCwIcon className={anyLive ? "size-3.5 animate-spin" : "size-3.5"} strokeWidth={1.5} />
          {anyLive ? "Importing" : "Refresh all"}
        </Button>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as SourceTab); setOpenIndex(-1); }}>
          <TabsList variant="line" className="h-auto gap-4 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
            <SourceTrigger value="all" label="All" count={counts?.total} live={anyLive} />
            {IMPORT_SOURCES.map((s) => (
              <SourceTrigger
                key={s}
                value={s}
                label={IMPORT_SOURCE_LABELS[s]}
                count={counts?.bySource[s]}
                last={lastImport(s)}
                live={Boolean(lastImport(s) && isImportLive(lastImport(s)!))}
              />
            ))}
          </TabsList>
        </Tabs>
        {showGrid && (
          <Tabs value={media} onValueChange={(v) => setMedia(v as Media)} className="mb-2">
            <TabsList>
              <TabsTrigger value="all" className="px-2.5 text-xs">All</TabsTrigger>
              <TabsTrigger value="image" className="px-2.5 text-xs">Images</TabsTrigger>
              <TabsTrigger value="video" className="px-2.5 text-xs">Videos</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {tab !== "all" && targets && (
        <SourceTabHeader
          key={tab}
          clientId={clientId}
          source={tab}
          target={targets[tab]}
          lastImport={lastImport(tab)}
          count={tabCount}
        />
      )}

      {newSinceLoad > 0 && (
        <div className="flex justify-center">
          <Button size="xs" variant="outline" className="rounded-full shadow-card" onClick={() => void refreshAssets()}>
            <ArrowUpIcon strokeWidth={1.5} />
            {newSinceLoad} new {newSinceLoad === 1 ? "asset" : "assets"}
          </Button>
        </div>
      )}

      {items.length > 0 ? (
        <>
          <BrandAssetsMasonry assets={items} onOpen={setOpenIndex} onRequestDelete={setPendingDelete} />
          <BrandAssetsLightbox
            assets={items}
            index={openIndex}
            onIndexChange={setOpenIndex}
            onClose={() => setOpenIndex(-1)}
            hasMore={Boolean(pages.hasNextPage)}
            onNeedMore={loadMore}
            onRequestDelete={setPendingDelete}
          />
          {pages.hasNextPage && (
            // Keyed by page count so each new page re-observes: a page too short to scroll would
            // otherwise leave the sentinel visible with no further intersection change.
            <InfiniteScrollSentinel key={pages.data?.pages.length ?? 0} loading={pages.isFetchingNextPage} onVisible={loadMore} />
          )}
        </>
      ) : showGrid && (pages.isPending || tabLive) ? (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-5">
          {SKELETON_HEIGHTS.map((h, i) => (
            <Skeleton key={i} className="mb-3 w-full break-inside-avoid rounded-lg" style={{ height: h }} />
          ))}
        </div>
      ) : pages.isError ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Couldn&apos;t load the brand assets.{" "}
          <Button variant="link" size="xs" className="h-auto px-0" onClick={() => void pages.refetch()}>
            Try again
          </Button>
        </p>
      ) : showGrid ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No {media === "video" ? "videos" : "images"} here.
        </p>
      ) : tab === "all" ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nothing imported yet. Open a source tab to connect it.
        </p>
      ) : null}

      <RefreshConfirmDialog plan={refreshPlan} onConfirm={confirmRefreshAll} onCancel={() => setRefreshPlan(null)} />
      <DeleteAssetDialog asset={pendingDelete} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
    </div>
  );
}

/** A source tab's label: its count, a spinner while importing, or a dot when the last import
 *  failed — so a problem is visible without opening the tab. */
function SourceTrigger(props: { value: SourceTab; label: string; count?: number; last?: AssetImport; live: boolean }) {
  const failed = props.last?.status === "failed";
  return (
    <TabsTrigger
      value={props.value}
      className="h-auto flex-none gap-1.5 rounded-none px-0.5 pb-2.5 pt-1 after:bg-primary group-data-horizontal/tabs:after:bottom-0"
    >
      {props.label}
      {props.live ? (
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent text-muted-foreground" />
      ) : failed && props.value !== "all" ? (
        <span aria-label="Last import failed" className="size-1.5 rounded-full bg-destructive" />
      ) : props.count ? (
        <span className="text-xs tabular-nums text-muted-foreground">{props.count}</span>
      ) : null}
    </TabsTrigger>
  );
}
